interface ShareModalProps {
  isSharedReadOnly: boolean
  sharePopupUrl: string
  sharePngPreviewUrl: string
  isCopySuccess: boolean
  isGeneratingPng: boolean
  onCopyAgain: () => void
  onDownloadPng: () => void
  onClose: () => void
}

export function ShareModal({
  isSharedReadOnly,
  sharePopupUrl,
  sharePngPreviewUrl,
  isCopySuccess,
  isGeneratingPng,
  onCopyAgain,
  onDownloadPng,
  onClose,
}: ShareModalProps) {
  return (
    <div className="share-modal-overlay" role="presentation">
      <div
        className="share-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Share URL copied!"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 style={{ color: '#89ffd8' }}>{isSharedReadOnly ? 'Read-only session' : 'Share URL copied!'}</h3>
        <p>URL stays here until close popup. Copy again anytime.</p>
        <input className="field share-url-field" type="text" value={sharePopupUrl} readOnly />
        {sharePngPreviewUrl ? (
          <div className="share-preview-wrap">
            <img className="share-preview-image" src={sharePngPreviewUrl} alt="Leaderboard story preview" />
          </div>
        ) : null}
        <div className="share-modal-actions">
          <button className={`primary-button ${isCopySuccess ? 'copy-success-feedback' : ''}`} type="button" onClick={onCopyAgain}>
            Copy again
          </button>
          <button className="ghost-button ghost-button-purple" type="button" onClick={onDownloadPng} disabled={isGeneratingPng}>
            Download PNG
          </button>
          <button className="ghost-button share-close-button" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
