type Props = {
  title: string
  detail: string
  onRetry: () => void
}

/**
 * 初期読み込みに失敗した場合の全面エラー（画面設計 7.1）。
 *
 * ボードが1つも出せない状態なので、部分的なメッセージではなく
 * 画面全体をこれに置き換える。
 */
export function LoadError({ title, detail, onRetry }: Props) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-5 py-10">
      <div className="text-center">
        <p className="m-0 text-5xl text-danger" aria-hidden="true">
          ⚠
        </p>
        <p className="mt-4 mb-1 text-lg font-bold">{title}</p>
        <p className="m-0 mb-5 text-ink-sub">{detail}</p>
        <button
          type="button"
          onClick={onRetry}
          className="cursor-pointer rounded-card border border-primary bg-primary px-2.5 py-1 text-primary-ink hover:bg-[#094a8b]"
        >
          再読み込み
        </button>
      </div>
    </div>
  )
}
