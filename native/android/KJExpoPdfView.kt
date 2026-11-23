package com.kishannareshpal.expopdf

import android.content.Context
import android.graphics.Color
import android.graphics.Rect
import android.net.Uri
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView
import com.github.barteksc.pdfviewer.PDFView
import com.github.barteksc.pdfviewer.listener.OnDrawListener
import com.github.barteksc.pdfviewer.listener.OnLongPressListener
import com.github.barteksc.pdfviewer.listener.OnTapListener
import expo.modules.kotlin.viewevent.EventDispatcher
import java.io.FileNotFoundException
import androidx.core.net.toUri
import com.github.barteksc.pdfviewer.util.SnapEdge
import com.kishannareshpal.expopdf.lib.FitMode

class KJExpoPdfView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  companion object {
    internal const val DEFAULT_PAGING_ENABLED = false
    internal const val DEFAULT_DOUBLE_TAP_ZOOM_ENABLED = true
    internal const val DEFAULT_HORIZONTAL_MODE_ENABLED = false
    internal const val DEFAULT_PAGE_GAP = 0
    internal const val DEFAULT_AUTO_SCALE_ENABLED = true
    internal val DEFAULT_CONTENT_PADDING = Rect(0, 0, 0, 0)
    internal val DEFAULT_FIT_MODE = FitMode.both
    internal val DEFAULT_PAGE_COLOR_INVERTED_ENABLED = false
  }

  private val onLoadComplete by EventDispatcher()
  private val onPageChanged by EventDispatcher()
  private val onError by EventDispatcher()
  private val onTextSelectionStarted by EventDispatcher()
  private val onTextSelectionChanged by EventDispatcher()
  private val onTextSelectionCancelled by EventDispatcher()
  private val onSelectionUnavailable by EventDispatcher()
  private val onHighlightTapped by EventDispatcher()

  internal enum class ErrorCode(val code: String) {
    invalidUri("invalid_uri"),
    invalidDocument("invalid_document"),
    passwordRequired("password_required"),
    passwordIncorrect("password_incorrect")
  }

  private var uri: Uri? = null
  private var password: String? = null
  private var isPagingEnabled: Boolean = DEFAULT_PAGING_ENABLED
  private var isDoubleTapZoomEnabled: Boolean = DEFAULT_DOUBLE_TAP_ZOOM_ENABLED
  private var isHorizontalModeEnabled: Boolean = DEFAULT_HORIZONTAL_MODE_ENABLED
  private var pageGap: Int = DEFAULT_PAGE_GAP
  private var contentPadding: Rect = DEFAULT_CONTENT_PADDING
  private var fitMode: FitMode = DEFAULT_FIT_MODE
  private var autoScaleEnabled: Boolean = DEFAULT_AUTO_SCALE_ENABLED
  private var isPageColorInverted: Boolean = DEFAULT_PAGE_COLOR_INVERTED_ENABLED
  private var initialPage: Int = 1
  private var targetPage: Int? = null
  private var withAnimation: Boolean = true
  private var loadedPageCount: Int = 0
  private var applyingInitialPage: Boolean = false
  private val selectionController by lazy {
    PdfTextSelectionController(
      context,
      pdfView,
      { payload -> if (payload["phase"] == "started") onTextSelectionStarted(payload) else onTextSelectionChanged(payload) },
      { payload -> onTextSelectionCancelled(payload) },
      { payload -> onHighlightTapped(payload) },
      { payload -> onSelectionUnavailable(payload) },
    )
  }

  internal val pdfView = PDFView(context, null).apply {
    layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
  }

  init {
    // Set the primitive PdfView's content background to transparent so that it inherits
    // the color from the React Native view (ExpoView), as defined by the
    // style prop in the component (`style={{ backgroundColor: '#eee' }}`).
    this.pdfView.setBackgroundColor(Color.TRANSPARENT)

    addView(this.pdfView)
  }

  override fun onDetachedFromWindow() {
    // The PDFView child recycles its own document as it detaches. Only release
    // the separately-owned PDFium text document here; calling recycle() after
    // super would close the viewer document for a second time.
    selectionController.releaseDocument()
    super.onDetachedFromWindow()
  }

  fun setUri(uri: String?) {
    if (uri == null) {
      this.reportError(ErrorCode.invalidUri, "No URI provided")
      return
    }

    try {
      this.uri = uri.toUri()
    } catch (_: Exception) {
      this.reportError(ErrorCode.invalidUri, "The provided URI is invalid")
    }

    this.reloadPdf()
  }

  fun setPassword(password: String?) {
    this.password = password;
    this.reloadPdf()
  }

  fun setPagingEnabled(enabled: Boolean?) {
    this.isPagingEnabled = enabled ?: DEFAULT_PAGING_ENABLED
    this.reloadPdf()
  }

  fun setDoubleTapZoomEnabled(enabled: Boolean?) {
    this.isDoubleTapZoomEnabled = enabled ?: DEFAULT_DOUBLE_TAP_ZOOM_ENABLED
    this.pdfView.enableDoubletap(this.isDoubleTapZoomEnabled)
  }

  fun setHorizontalModeEnabled(enabled: Boolean?) {
    this.isHorizontalModeEnabled = enabled ?: DEFAULT_HORIZONTAL_MODE_ENABLED
    this.reloadPdf()
  }

  fun setPageGap(pageGap: Int?) {
    this.pageGap = pageGap ?: DEFAULT_PAGE_GAP
    this.reloadPdf()
  }

  fun setContentPadding(rect: Rect?) {
    this.contentPadding = rect ?: DEFAULT_CONTENT_PADDING
    this.reloadPdf()
  }

  fun setFitMode(mode: FitMode?) {
    this.fitMode = mode ?: DEFAULT_FIT_MODE
    this.reloadPdf()
  }

  fun setPageColorInverted(enabled: Boolean?) {
    this.isPageColorInverted = enabled ?: DEFAULT_PAGE_COLOR_INVERTED_ENABLED
    this.reloadPdf()
  }

  fun setAutoScaleEnabled(enabled: Boolean?) {
    this.autoScaleEnabled = enabled ?: DEFAULT_AUTO_SCALE_ENABLED
    this.reloadPdf()
  }

  fun setInitialPage(page: Int?) {
    initialPage = (page ?: 1).coerceAtLeast(1)
    if (loadedPageCount > 0 && targetPage == null) pdfView.jumpTo(initialPage.coerceAtMost(loadedPageCount) - 1, false)
  }
  fun setWithAnimation(enabled: Boolean?) { withAnimation = enabled ?: true }
  fun setHighlightsJson(json: String?) { selectionController.setHighlights(json) }
  fun setSelectionClearToken(token: Int?) { selectionController.clearSelection(token) }
  fun setSelectionCopyRequest(request: String?) { selectionController.requestCopy(request) }
  fun setTargetPage(page: Int?) {
    if (page == null) {
      targetPage = null
      return
    }
    targetPage = page.coerceAtLeast(1)
    if (loadedPageCount > 0) pdfView.jumpTo(targetPage!!.coerceAtMost(loadedPageCount) - 1, withAnimation)
  }

  private fun reloadPdf() {
    selectionController.releaseDocument()
    loadedPageCount = 0
    if (!this.pdfView.isRecycled) {
      this.pdfView.recycle()
    }

    val currentUri = this.uri ?: return

    val pdfBuilder = try {
      if (currentUri.scheme == "content") {
        val contentResolver = context.contentResolver
        val inputStream = contentResolver.openInputStream(currentUri)
          ?: throw FileNotFoundException("Could not open input stream for the provided URI: $currentUri")
        this.pdfView.fromStream(inputStream)
      } else {
        this.pdfView.fromUri(currentUri)
      }
    } catch (e: Exception) {
      this.reportError(ErrorCode.invalidDocument, e.message.toString())
      return
    }

    pdfBuilder
      .pageFitPolicy(this.fitMode.toFitPolicy())
      .enableDoubletap(this.isDoubleTapZoomEnabled)
      .swipeHorizontal(this.isHorizontalModeEnabled)
      .nightMode(this.isPageColorInverted)
      .spacing(this.pageGap)
      .autoCenterOnResize(this.autoScaleEnabled)
      .contentPadding(
        this.contentPadding.left,
        this.contentPadding.top,
        this.contentPadding.right,
        this.contentPadding.bottom
      )
      .onLoad { pageCount ->
        if (pageCount <= 0) {
          this.reportError(ErrorCode.invalidDocument, "The PDF has no pages")
          return@onLoad
        }
        loadedPageCount = pageCount
        val pageToOpen = (targetPage ?: initialPage).coerceIn(1, pageCount)
        applyingInitialPage = true
        pdfView.jumpTo(pageToOpen - 1, false)
        applyingInitialPage = false
        if (pageCount > 0) this.uri?.let { selectionController.load(it, password) }
        this.onLoadComplete(
          mapOf(
            "pageCount" to pageCount
          )
        )
      }
      .onPageChange { pageIndex, pageCount ->
        if (applyingInitialPage) return@onPageChange
        selectionController.clearForPageChange(pageIndex)
        this.onPageChanged(
          mapOf(
            "pageIndex" to pageIndex,
            "pageCount" to pageCount
          )
        )
      }
      .onLongPress(OnLongPressListener { event -> selectionController.onLongPress(event) })
      .onTap(OnTapListener { event -> selectionController.onTap(event) })
      .onDrawAll(selectionController.drawListenerForPages())

    post {
      pdfBuilder
        .onError { e ->
          // PDF fails to load if it's NOT pw protected AND a password is provided.
          // - For this reason, the first time we load the pdf, we check if we have received the pw
          //   required error and retry loading the PDF with password provided
          if (e.message.toString().lowercase().contains("password required")) {
            if (this.password == null) {
              this.reportError(
                ErrorCode.passwordRequired,
                "PDF requires a password, but no password was provided"
              )
            } else {
              // Password has been provided, so re-attempt a load
              pdfBuilder
                .password(this.password)
                .onError {
                  this.reportError(
                    ErrorCode.passwordIncorrect,
                    "The provided password was incorrect"
                  )
                }
                .load()
            }
          }
        }
        .load()
    }
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    if (this.uri != null) this.reloadPdf()
  }

  private fun reportError(error: ErrorCode, message: String) {
    this.onError(
      mapOf(
        "code" to error.code,
        "message" to message
      )
    )
  }
}
