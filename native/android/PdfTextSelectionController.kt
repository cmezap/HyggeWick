package com.kishannareshpal.expopdf

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.view.MotionEvent
import android.widget.Toast
import com.github.barteksc.pdfviewer.PDFView
import com.github.barteksc.pdfviewer.listener.OnDrawListener
import io.legere.pdfiumandroid.PdfDocument
import io.legere.pdfiumandroid.PdfPage
import io.legere.pdfiumandroid.PdfTextPage
import io.legere.pdfiumandroid.PdfiumCore
import io.legere.pdfiumandroid.util.AlreadyClosedBehavior
import io.legere.pdfiumandroid.util.Config
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import kotlin.math.max
import kotlin.math.min

/** Native PDF text selection. Coordinates emitted to JS are normalized page-local values. */
internal class PdfTextSelectionController(
  private val context: Context,
  private val pdfView: PDFView,
  private val onSelection: (Map<String, Any>) -> Unit,
  private val onCancelled: (Map<String, Any>) -> Unit,
  private val onHighlightTapped: (Map<String, Any>) -> Unit,
  private val onUnavailable: (Map<String, Any>) -> Unit,
) {
  private data class NormalizedRect(val left: Float, val top: Float, val right: Float, val bottom: Float)
  private data class Highlight(val id: String, val page: Int, val color: Int, val rects: List<NormalizedRect>)
  private data class PageTransform(val viewToPage: Matrix, val width: Float, val height: Float)
  private data class Selection(
    val page: Int,
    val anchor: Int,
    val baseStart: Int,
    val baseEnd: Int,
    var start: Int,
    var end: Int,
  )

  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private val visiblePages = ConcurrentHashMap<Int, PageTransform>()
  private val highlights = mutableListOf<Highlight>()
  private val highlightPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
  private val selectionPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL; color = Color.argb(105, 143, 189, 235) }
  private var loadJob: Job? = null
  private var loadGeneration = 0
  private var document: PdfDocument? = null
  private var selection: Selection? = null
  private var selectionPayload: Map<String, Any>? = null
  private var selectedHighlightId: String? = null
  private var clearToken: Int? = null
  private var highlightsJson = "[]"

  val drawListener = OnDrawListener { canvas, pageWidth, pageHeight, pageIndex ->
    if (pageWidth <= 0f || pageHeight <= 0f) return@OnDrawListener
    val pageToView = Matrix(canvas.matrix)
    val viewToPage = Matrix()
    if (pageToView.invert(viewToPage)) {
      visiblePages[pageIndex] = PageTransform(viewToPage, pageWidth, pageHeight)
    }
    drawPage(canvas, pageWidth, pageHeight, pageIndex)
  }

  fun load(uri: Uri, password: String?) {
    releaseDocument()
    val generation = ++loadGeneration
    loadJob = scope.launch {
      var descriptor: ParcelFileDescriptor? = null
      try {
        descriptor = openDescriptor(uri)
        val core = PdfiumCore(context, Config(alreadyClosedBehavior = AlreadyClosedBehavior.IGNORE))
        val opened = core.newDocument(descriptor, password)
        descriptor = null // PdfDocument owns the descriptor and closes it in close().
        pdfView.post {
          if (generation == loadGeneration) document = opened else opened.close()
        }
      } catch (_: Throwable) {
        descriptor?.close()
        pdfView.post {
          if (generation == loadGeneration) onUnavailable(mapOf("reason" to "text_index_unavailable"))
        }
      }
    }
  }

  private fun openDescriptor(uri: Uri): ParcelFileDescriptor {
    return if (uri.scheme == "file") {
      val path = uri.path ?: throw IllegalArgumentException("PDF file URI has no path")
      ParcelFileDescriptor.open(File(path), ParcelFileDescriptor.MODE_READ_ONLY)
    } else {
      context.contentResolver.openFileDescriptor(uri, "r")
        ?: throw IllegalArgumentException("Could not open PDF descriptor")
    }
  }

  fun setHighlights(json: String?) {
    val nextJson = json ?: "[]"
    if (nextJson == highlightsJson) return
    highlightsJson = nextJson
    highlights.clear()
    try {
      val array = JSONArray(nextJson)
      for (i in 0 until array.length()) {
        val item = array.getJSONObject(i)
        val rectArray = item.getJSONArray("rects")
        val rects = (0 until rectArray.length()).mapNotNull { index ->
          val rect = rectArray.optJSONObject(index) ?: return@mapNotNull null
          NormalizedRect(
            rect.optDouble("left", Double.NaN).toFloat(), rect.optDouble("top", Double.NaN).toFloat(),
            rect.optDouble("right", Double.NaN).toFloat(), rect.optDouble("bottom", Double.NaN).toFloat(),
          ).takeIf { it.left.isFinite() && it.top.isFinite() && it.right.isFinite() && it.bottom.isFinite() }
        }
        if (rects.isNotEmpty()) {
          highlights.add(Highlight(item.getString("id"), item.getInt("page"), Color.parseColor(item.getString("color")), rects))
        }
      }
    } catch (_: Exception) {
      highlights.clear()
    }
    pdfView.invalidate()
  }

  fun clearSelection(token: Int?) {
    if (token == null || token == clearToken) return
    clearToken = token
    cancelSelection("cleared")
  }

  fun requestCopy(json: String?) {
    if (json.isNullOrBlank()) return
    try {
      val request = JSONObject(json)
      val text = request.optString("text").trim()
      if (text.isNotEmpty()) {
        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        clipboard.setPrimaryClip(ClipData.newPlainText("HyggeWick", text))
        Toast.makeText(context, "Texto copiado", Toast.LENGTH_SHORT).show()
      }
    } catch (_: Exception) {
      // Invalid bridge payloads are ignored; selection remains active.
    }
  }

  fun onLongPress(event: MotionEvent) {
    val document = document ?: return
    val hit = findTextHit(document, event.x, event.y)
    if (hit == null) {
      onUnavailable(mapOf("reason" to if (document.isClosed) "text_index_unavailable" else "no_text_at_point"))
      return
    }
    val pageSelection = withTextPage(document, hit.page) { page, textPage ->
      val count = textPage.textPageCountChars()
      if (count <= 0 || hit.charIndex !in 0 until count) return@withTextPage null
      val bounds = wordBounds(textPage, hit.charIndex, count)
      buildSelection(page, textPage, hit.page, hit.charIndex, bounds.first, bounds.last + 1)
    }
    if (pageSelection == null) {
      onUnavailable(mapOf("reason" to "no_text_at_point", "pageIndex" to hit.page))
      return
    }
    selection = pageSelection.first
    selectionPayload = pageSelection.second
    onSelection(pageSelection.second + mapOf("phase" to "started"))
    pdfView.invalidate()
  }

  fun onTap(event: MotionEvent): Boolean {
    val document = document ?: return false
    val visibleHit = pageLocalHit(event.x, event.y)
    if (visibleHit == null) {
      if (selection != null) cancelSelection("outside_document")
      dismissSelectedHighlight()
      return false
    }
    val existingSelection = selection
    if (existingSelection != null) {
      if (visibleHit.first != existingSelection.page) {
        cancelSelection("page_changed")
        return false
      }
      val hit = findTextHit(document, event.x, event.y, visibleHit)
      if (hit == null) {
        cancelSelection("outside_text")
        return false
      }
      val nextPayload = withTextPage(document, hit.page) { page, textPage ->
        val count = textPage.textPageCountChars()
        if (count <= 0 || hit.charIndex !in 0 until count) return@withTextPage null
        val endpoint = wordBounds(textPage, hit.charIndex, count)
        val start = if (endpoint.last < existingSelection.baseStart) endpoint.first else existingSelection.baseStart
        val end = if (endpoint.first > existingSelection.baseEnd) endpoint.last + 1 else existingSelection.baseEnd
        existingSelection.start = min(start, end - 1)
        existingSelection.end = max(start, end)
        buildSelection(page, textPage, hit.page, existingSelection.anchor, existingSelection.start, existingSelection.end)
      } ?: return false
      selectionPayload = nextPayload.second
      onSelection(nextPayload.second + mapOf("phase" to "changed"))
      pdfView.invalidate()
      return true
    }

    val local = visibleHit.second
    val transform = visiblePages[visibleHit.first] ?: return false
    val normalizedX = local.x / transform.width
    val normalizedY = local.y / transform.height
    val highlight = highlights.firstOrNull { item ->
      item.page == visibleHit.first + 1 && item.rects.any { normalizedX in it.left..it.right && normalizedY in it.top..it.bottom }
    }
    if (highlight != null) {
      selectedHighlightId = highlight.id
      onHighlightTapped(mapOf("id" to highlight.id, "page" to highlight.page))
      return true
    }
    dismissSelectedHighlight()
    return false
  }

  private fun dismissSelectedHighlight() {
    val id = selectedHighlightId ?: return
    selectedHighlightId = null
    onCancelled(mapOf("pageIndex" to 0, "reason" to "highlight_dismissed", "highlightId" to id))
  }

  private data class TextHit(val page: Int, val charIndex: Int, val localPoint: android.graphics.PointF)

  private fun pageLocalHit(x: Float, y: Float): Pair<Int, android.graphics.PointF>? {
    for ((pageIndex, transform) in visiblePages.entries.sortedBy { it.key }) {
      val point = floatArrayOf(x, y)
      transform.viewToPage.mapPoints(point)
      if (point[0] >= 0f && point[1] >= 0f && point[0] <= transform.width && point[1] <= transform.height) {
        return pageIndex to android.graphics.PointF(point[0], point[1])
      }
    }
    return null
  }

  private fun findTextHit(
    document: PdfDocument,
    x: Float,
    y: Float,
    knownHit: Pair<Int, android.graphics.PointF>? = null,
  ): TextHit? {
    val pageHit = knownHit ?: pageLocalHit(x, y) ?: return null
    val transform = visiblePages[pageHit.first] ?: return null
    return withTextPage(document, pageHit.first) { page, textPage ->
      val rotation = page.getPageRotation().coerceIn(0, 3)
      val pagePoint = page.mapDeviceCoordsToPage(
        0, 0, transform.width.toInt().coerceAtLeast(1), transform.height.toInt().coerceAtLeast(1), rotation,
        pageHit.second.x.toInt(), pageHit.second.y.toInt(),
      )
      val pageWidthPoints = page.getPageWidthPoint().toFloat().coerceAtLeast(1f)
      val pageHeightPoints = page.getPageHeightPoint().toFloat().coerceAtLeast(1f)
      val toleranceX = max(1.5, 10.0 * context.resources.displayMetrics.density * pageWidthPoints / transform.width)
      val toleranceY = max(1.5, 10.0 * context.resources.displayMetrics.density * pageHeightPoints / transform.height)
      val charIndex = textPage.textPageGetCharIndexAtPos(pagePoint.x.toDouble(), pagePoint.y.toDouble(), toleranceX, toleranceY)
      if (charIndex < 0) null else TextHit(pageHit.first, charIndex, pageHit.second)
    }
  }

  private fun wordBounds(textPage: PdfTextPage, charIndex: Int, count: Int): IntRange {
    fun isWordCharacter(index: Int): Boolean {
      val character = textPage.textPageGetUnicode(index)
      return !character.isWhitespace() && !character.isISOControl()
    }
    var start = charIndex
    var end = charIndex
    if (!isWordCharacter(charIndex)) return charIndex..charIndex
    while (start > 0 && isWordCharacter(start - 1)) start--
    while (end + 1 < count && isWordCharacter(end + 1)) end++
    return start..end
  }

  private fun buildSelection(
    page: PdfPage,
    textPage: PdfTextPage,
    pageIndex: Int,
    anchor: Int,
    start: Int,
    endExclusive: Int,
  ): Pair<Selection, Map<String, Any>>? {
    val count = textPage.textPageCountChars()
    val safeStart = start.coerceIn(0, count)
    val safeEnd = endExclusive.coerceIn(safeStart, count)
    if (safeEnd <= safeStart) return null
    val selectedText = textPage.textPageGetText(safeStart, safeEnd - safeStart)
      ?.replace("\u0000", "")?.trim().orEmpty()
    if (selectedText.isEmpty()) return null
    val transform = visiblePages[pageIndex] ?: return null
    val rotation = page.getPageRotation().coerceIn(0, 3)
    val rectRanges = textPage.textPageGetRectsForRanges(intArrayOf(safeStart, safeEnd - safeStart)).orEmpty()
    val rects = rectRanges.mapNotNull { rangeRect ->
      val device = page.mapRectToDevice(
        0, 0, transform.width.toInt().coerceAtLeast(1), transform.height.toInt().coerceAtLeast(1), rotation, rangeRect.rect,
      )
      device.sort()
      val rect = NormalizedRect(
        (device.left / transform.width).coerceIn(0f, 1f),
        (device.top / transform.height).coerceIn(0f, 1f),
        (device.right / transform.width).coerceIn(0f, 1f),
        (device.bottom / transform.height).coerceIn(0f, 1f),
      )
      rect.takeIf { it.right > it.left && it.bottom > it.top }
    }
    if (rects.isEmpty()) return null
    val nextSelection = Selection(pageIndex, anchor, safeStart, safeEnd, safeStart, safeEnd)
    val payload = mapOf(
      "pageIndex" to pageIndex,
      "startIndex" to safeStart,
      "endIndex" to safeEnd,
      "text" to selectedText,
      "pageRotation" to rotation,
      "coordinateSpace" to "normalizedPageTopLeft",
      "rects" to rects.map { rect -> mapOf(
        "left" to rect.left.toDouble(), "top" to rect.top.toDouble(),
        "right" to rect.right.toDouble(), "bottom" to rect.bottom.toDouble(),
      ) },
    )
    selectionPaint.color = Color.argb(105, 143, 189, 235)
    return nextSelection to payload
  }

  private inline fun <T> withTextPage(document: PdfDocument, pageIndex: Int, block: (PdfPage, PdfTextPage) -> T): T? {
    return try {
      document.openPage(pageIndex).use { page -> page.openTextPage().use { textPage -> block(page, textPage) } }
    } catch (_: Exception) {
      null
    }
  }

  private fun drawPage(canvas: Canvas, pageWidth: Float, pageHeight: Float, pageIndex: Int) {
    for (highlight in highlights) {
      if (highlight.page != pageIndex + 1) continue
      highlightPaint.color = (highlight.color and 0x00FFFFFF) or (112 shl 24)
      highlight.rects.forEach { rect ->
        canvas.drawRect(rect.left * pageWidth, rect.top * pageHeight, rect.right * pageWidth, rect.bottom * pageHeight, highlightPaint)
      }
    }
    val current = selection
    val payload = selectionPayload
    if (current?.page != pageIndex || payload == null) return
    @Suppress("UNCHECKED_CAST")
    val rects = payload["rects"] as? List<Map<String, Double>> ?: return
    rects.forEach { rect ->
      canvas.drawRect(
        rect.getValue("left").toFloat() * pageWidth, rect.getValue("top").toFloat() * pageHeight,
        rect.getValue("right").toFloat() * pageWidth, rect.getValue("bottom").toFloat() * pageHeight,
        selectionPaint,
      )
    }
  }

  private fun cancelSelection(reason: String) {
    val page = selection?.page
    if (page != null) {
      selection = null
      selectionPayload = null
      onCancelled(mapOf("pageIndex" to page, "reason" to reason))
    }
    dismissSelectedHighlight()
    if (page != null) pdfView.invalidate()
  }

  fun clearForPageChange(pageIndex: Int) {
    if (selection?.page != pageIndex) cancelSelection("page_changed")
    dismissSelectedHighlight()
    visiblePages.keys.removeIf { it !in max(0, pageIndex - 2)..(pageIndex + 2) }
  }

  fun releaseDocument() {
    loadGeneration++
    loadJob?.cancel()
    loadJob = null
    selection = null
    selectionPayload = null
    selectedHighlightId = null
    visiblePages.clear()
    document?.close()
    document = null
  }

  fun drawListenerForPages(): OnDrawListener = drawListener
}
