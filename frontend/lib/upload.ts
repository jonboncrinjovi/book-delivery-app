// Prepares a picture on the phone and uploads it. createImageBitmap applies the photo's own rotation
// (phones store it separately), the canvas flattens it on white and shrinks it to 4000 px at most.
export async function uploadImage(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 4000 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Не получилось обработать картинку");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((ok, fail) =>
    canvas.toBlob((b) => (b ? ok(b) : fail(new Error("Не получилось обработать картинку"))), "image/jpeg", 0.92));

  const form = new FormData();
  form.append("image", blob, "image.jpg");
  const res = await fetch("/api/uploads", { method: "POST", body: form });
  if (res.status === 401) throw new Error("Войдите через Telegram, чтобы загрузить картинку");
  if (!res.ok) throw new Error((await res.text()).trim());
  return (await res.json()).id;
}
