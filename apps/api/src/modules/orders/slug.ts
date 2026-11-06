/** Do'kon nomidan vitrina havolasi: «Yashil Savat» -> yashil-savat. Lotin harf, raqam va tire; 3–30 belgi. */
export function slugify(name: string): string {
  const base = name.replace(/№/g, " ").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/['’`ʻʼ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30).replace(/-+$/g, "");
  return base.length >= 3 ? base : "dokon";
}
