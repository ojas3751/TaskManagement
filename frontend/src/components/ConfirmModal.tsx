import { useEffect, useRef } from 'react'

type Props = {
  /** 見出し。「削除の確認」など */
  title: string
  /** 本文。何が起きるかを具体的に書く。改行したい場合は配列の要素で分ける */
  lines: string[]
  /** 実行ボタンの文言。「削除する」など */
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}

/**
 * 取り消せない操作の確認モーダル（画面設計 6章）。
 * タスクの削除（F-08）で使う。リストの削除（F-04）・選択削除（F-15）でも使う想定。
 *
 * confirm() を使わないのは、名前の入力（E-01）と同じく見た目と文言を仕様どおりに
 * 作れないため（機能仕様書「誤操作・エラーへの対策」）。
 */
export function ConfirmModal({ title, lines, confirmLabel, onConfirm, onCancel }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  // 初期フォーカスはキャンセルに置く。開いた直後に Enter を押しても削除されないように
  // するため（画面設計 6章）。取り消せない操作なので、既定は「何もしない」側に倒す
  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        className="w-full max-w-100 rounded-card bg-surface shadow-lg"
      >
        <div className="border-b border-line px-4 py-3">
          <h2 id="confirm-modal-title" className="m-0 text-base font-bold">
            {title}
          </h2>
        </div>

        <div className="px-4 py-3">
          {lines.map((line) => (
            <p key={line} className="m-0 [overflow-wrap:anywhere]">
              {line}
            </p>
          ))}
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
          <button
            type="button"
            ref={cancelRef}
            onClick={onCancel}
            className="cursor-pointer rounded-card border border-line bg-surface px-2.5 py-1 hover:bg-list-bg"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onConfirm}
            // danger は白文字とのコントラスト 6.0:1（index.css のコメント）
            className="cursor-pointer rounded-card border border-danger bg-danger px-2.5 py-1 text-danger-ink hover:bg-[#8f1e18]"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
