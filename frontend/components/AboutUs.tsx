const WINE = "#57030d";
// «О нас»: who we are, and the personal library service
export default function AboutUs() {
  return (
    <div className="space-y-3 p-4">
      <p className="text-xl" style={{ color: WINE }}>О нас</p>
      <p className="leading-snug">
        Мы — небольшая команда художников, дизайнеров, программистов и книжников. На всех у нас полвека опыта
        в книжном деле, и мы работаем рука об руку с теми, кто делает книги в России.
      </p>
      <p className="leading-snug">
        Книги — наш личный сорт дофамина. Мы подбираем их так, как сомелье подбирает вино: под человека, повод и настроение.
      </p>
      <p className="pt-2 text-lg" style={{ color: WINE }}>Персональная библиотека</p>
      <p className="leading-snug">
        Для тех, кто хочет большего: соберём личную библиотеку с нуля, найдём редкие издания и исполним любые
        литературные желания.
      </p>
      <a href="mailto:premium@literalwine.ru" className="inline-block font-sans text-sm underline" style={{ color: WINE }}>
        premium@literalwine.ru
      </a>
    </div>
  );
}
