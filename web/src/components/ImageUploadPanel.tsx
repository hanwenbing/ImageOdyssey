type ImageUploadPanelProps = {
  title: string;
  helper: string;
  imageUrl: string | null;
  disabled?: boolean;
  busy?: boolean;
  onFileSelected: (file: File) => void;
};

export function ImageUploadPanel({
  title,
  helper,
  imageUrl,
  disabled = false,
  busy = false,
  onFileSelected
}: ImageUploadPanelProps) {
  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-lg border border-white/10 bg-white/[0.04] p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
          <p className="mt-1 text-xs text-zinc-400">{helper}</p>
        </div>
        {busy && <span className="text-xs text-cyan-200">上传中</span>}
      </div>
      <label
        className={`relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-md border border-dashed text-sm transition ${
          disabled
            ? "cursor-not-allowed border-zinc-700 bg-zinc-900 text-zinc-500"
            : "cursor-pointer border-zinc-600 bg-zinc-900 text-zinc-300 hover:border-cyan-300 hover:text-cyan-100"
        }`}
      >
        {imageUrl ? (
          <img
            className="h-full w-full object-contain"
            src={imageUrl}
            alt={`${title} preview`}
          />
        ) : (
          <span>{disabled ? "等待改写完成" : "选择图片"}</span>
        )}
        <input
          className="sr-only"
          aria-label={title}
          type="file"
          accept="image/*"
          disabled={disabled || busy}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) {
              onFileSelected(file);
            }
          }}
        />
      </label>
    </section>
  );
}
