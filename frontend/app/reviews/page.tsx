"use client";

import { useCallback, useEffect, useState } from "react";

type Review = {
  id: number; product_id: number; book: string; author: string; text: string;
  avg: number; votes: number; plaque: boolean; my_vote: number | null; mine: boolean; created_at: string;
};
type ServiceReview = { id: number; author: string; grapes: number; text: string; at: string };
type Activity = { who: string; book: string; at: string };
type BookRef = { id: number; name: string };
type OrderRef = { id: number; created_at: string };

const grapes = ["", "Лист", "Цветение", "Завязь", "Созревание", "Гроздь"];
const time = (iso: string) => new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
const day = (iso: string) => new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
const input = "w-full rounded-xl border border-line bg-paper p-3 font-sans";

export default function ReviewsPage() {
  const [tab, setTab] = useState<"books" | "service">("books"); // left: books, right: us

  return (
    <div className="pt-4">
      <h1 className="text-3xl font-bold">Рецензии</h1>

      {/* the two tabs */}
      <div className="mt-4 grid grid-cols-2 rounded-full border border-line bg-paper-2 p-1 font-sans text-sm">
        <button onClick={() => setTab("books")}
          className={`rounded-full py-2 ${tab === "books" ? "bg-wine text-paper-2" : "text-muted"}`}>О книгах</button>
        <button onClick={() => setTab("service")}
          className={`rounded-full py-2 ${tab === "service" ? "bg-wine text-paper-2" : "text-muted"}`}>О нас</button>
      </div>

      {tab === "books" ? <BookReviews /> : <ServiceReviews />}
    </div>
  );
}

function BookReviews() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [books, setBooks] = useState<BookRef[] | null>(null); // null = not logged in
  const [book, setBook] = useState<number | "">("");
  const [text, setText] = useState("");
  const [message, setMessage] = useState("");

  const loadReviews = useCallback(() => {
    fetch("/api/reviews").then((r) => r.json()).then(setReviews).catch(() => {});
  }, []);
  const loadBooks = useCallback(() => {
    fetch("/api/me/reviewable").then((r) => (r.ok ? r.json() : null)).then(setBooks).catch(() => setBooks(null));
  }, []);

  useEffect(() => {
    loadReviews();
    loadBooks();
    const loadActivity = () => fetch("/api/reviews/activity").then((r) => r.json()).then(setActivity).catch(() => {});
    loadActivity();
    const timer = setInterval(loadActivity, 10000); // the log refreshes every 10 seconds
    return () => clearInterval(timer);
  }, [loadReviews, loadBooks]);

  async function submit() {
    setMessage("");
    const res = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: book, text }),
    });
    if (!res.ok) {
      setMessage((await res.text()).trim());
      return;
    }
    setMessage("Спасибо! Рецензия появится после модерации.");
    setText("");
    setBook("");
    loadBooks();
  }

  async function vote(id: number, value: number) {
    const res = await fetch(`/api/reviews/${id}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grapes: value }),
    });
    if (res.status === 401) {
      setMessage("Войди, чтобы оценивать рецензии");
      return;
    }
    loadReviews();
  }

  return (
    <>
      <p className="mt-4 font-sans text-sm text-muted">Не о сюжете, а о том, что книга с тобой сделала. До 200 знаков.</p>

      {activity.length > 0 && (
        <ul className="mt-4 max-h-28 space-y-1 overflow-y-auto rounded-2xl border border-line bg-paper-2 p-3 font-sans text-xs">
          {activity.map((a, i) => (
            <li key={i}><span className="text-muted">{time(a.at)}</span> {a.who} о «{a.book}»</li>
          ))}
        </ul>
      )}

      {books === null ? (
        <p className="mt-6 font-sans text-sm text-muted">Войди в профиле, чтобы писать рецензии и оценивать чужие.</p>
      ) : books.length === 0 ? (
        <p className="mt-6 font-sans text-sm text-muted">Отметь прочитанное у сомелье, и сможешь написать о нём здесь.</p>
      ) : (
        <div className="mt-6 space-y-2 rounded-2xl border border-line bg-paper-2 p-4">
          <select value={book} onChange={(e) => setBook(e.target.value ? Number(e.target.value) : "")} className={input}>
            <option value="">Какая книга?</option>
            {books.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={200} rows={3}
            placeholder="Что ты почувствовал?" className={input} />
          <div className="flex items-center justify-between font-sans text-sm">
            <span className="text-muted">{text.length}/200</span>
            <button onClick={submit} disabled={book === "" || text.trim().length < 10}
              className="rounded-full bg-wine px-5 py-2 text-paper-2 disabled:opacity-40">Отправить</button>
          </div>
        </div>
      )}
      {message && <p className="mt-3 font-sans text-sm text-wine">{message}</p>}

      <ul className="mt-8 space-y-4">
        {reviews.map((r) => (
          <li key={r.id} className="rounded-2xl border border-line bg-paper-2 p-4">
            {r.plaque && <p className="mb-2 font-sans text-xs font-bold text-gold">Золотая лоза</p>}
            <p className="italic">«{r.text}»</p>
            <p className="mt-2 font-sans text-xs text-muted">{r.author} о «{r.book}»</p>
            <p className="mt-2 font-sans text-xs">
              {r.votes > 0 ? `${grapes[Math.round(r.avg)]} · ${r.votes} оценок` : "Ещё не оценено"}
            </p>
            {!r.mine && (
              <div className="mt-2 flex flex-wrap gap-1 font-sans text-xs">
                {[1, 2, 3, 4, 5].map((g) => (
                  <button key={g} onClick={() => vote(r.id, g)}
                    className={`rounded-full border px-2 py-1 ${r.my_vote === g ? "border-wine bg-wine text-paper-2" : "border-line"}`}>
                    {grapes[g]}
                  </button>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

function ServiceReviews() {
  const [reviews, setReviews] = useState<ServiceReview[]>([]);
  const [orders, setOrders] = useState<OrderRef[] | null>(null); // null = not logged in
  const [order, setOrder] = useState<number | "">("");
  const [score, setScore] = useState(0);
  const [text, setText] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(() => {
    fetch("/api/service-reviews").then((r) => r.json()).then(setReviews).catch(() => {});
    fetch("/api/me/reviewable-orders").then((r) => (r.ok ? r.json() : null)).then(setOrders).catch(() => setOrders(null));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function submit() {
    setMessage("");
    const res = await fetch("/api/service-reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_id: order, grapes: score, text }),
    });
    if (!res.ok) {
      setMessage((await res.text()).trim());
      return;
    }
    setMessage("Спасибо! Отзыв появится после модерации.");
    setText("");
    setScore(0);
    setOrder("");
    load();
  }

  return (
    <>
      <p className="mt-4 font-sans text-sm text-muted">Как прошла доставка, какой была коробка, удался ли сюрприз.</p>

      {orders !== null && orders.length > 0 && (
        <div className="mt-6 space-y-2 rounded-2xl border border-line bg-paper-2 p-4">
          <select value={order} onChange={(e) => setOrder(e.target.value ? Number(e.target.value) : "")} className={input}>
            <option value="">Какой заказ?</option>
            {orders.map((o) => <option key={o.id} value={o.id}>№{o.id} от {day(o.created_at)}</option>)}
          </select>
          <div className="flex flex-wrap gap-1 font-sans text-xs">
            {[1, 2, 3, 4, 5].map((g) => (
              <button key={g} onClick={() => setScore(g)}
                className={`rounded-full border px-2 py-1 ${score === g ? "border-wine bg-wine text-paper-2" : "border-line"}`}>
                {grapes[g]}
              </button>
            ))}
          </div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={300} rows={4}
            placeholder="Расскажи, как всё прошло" className={input} />
          <div className="flex items-center justify-between font-sans text-sm">
            <span className="text-muted">{text.length}/300</span>
            <button onClick={submit} disabled={order === "" || score === 0 || text.trim().length < 10}
              className="rounded-full bg-wine px-5 py-2 text-paper-2 disabled:opacity-40">Отправить</button>
          </div>
        </div>
      )}
      {orders === null && (
        <p className="mt-6 font-sans text-sm text-muted">Войди в профиле, чтобы оставить отзыв о доставке.</p>
      )}
      {message && <p className="mt-3 font-sans text-sm text-wine">{message}</p>}

      <ul className="mt-8 space-y-4">
        {reviews.length === 0 && <li className="font-sans text-sm text-muted">Отзывов пока нет. Твой может быть первым.</li>}
        {reviews.map((r) => (
          <li key={r.id} className="rounded-2xl border border-line bg-paper-2 p-4">
            <p className="font-sans text-xs font-bold">{grapes[r.grapes]}</p>
            <p className="mt-1 italic">«{r.text}»</p>
            <p className="mt-2 font-sans text-xs text-muted">{r.author}, {day(r.at)}</p>
          </li>
        ))}
      </ul>
    </>
  );
}
