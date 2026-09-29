"""Якорь и защита от него · урок 2 — «Ставить якорь: только с критерием»."""

from app.course.lessons._model import (Dialog, LessonMaterial, Limit, Mistake,
                                       Phrase, T, them, you)

MATERIAL = LessonMaterial(
    block="anchoring",
    lesson=2,
    scenario_id="used_car",
    technique=T("Первая цифра — сразу с основанием", "Your first number, with its reason attached"),
    why=T(
        "Когда первое слово за вами, обычно ошибаются одним из двух способов: называют голую "
        "цифру «с запасом» («даю 900») или цифру без объяснения, которую тут же приходится "
        "сдавать. Голая цифра — заявка на упрямство: в ответ вы получите такую же голую цифру "
        "с другой стороны, и начнётся перетягивание каната. Приём: ставить якорь так, чтобы "
        "его было трудно отбросить, — цифра и источник в одной реплике.",
        "When the first word is yours, people usually go wrong in one of two ways: they name a "
        "bare number “with room to spare” (“I will give you 900”), or a number with no "
        "explanation that they then have to give up at once. A bare number is a bid for "
        "stubbornness: you get an equally bare number back from the other side, and the tug "
        "of war begins. The technique: set your anchor so it is hard to brush aside — the "
        "number and its source in one line.",
    ),
    core=T(
        "Якорь с критерием — три части в одной фразе.\n\n"
        "Позиция: «я предлагаю 1080», «наша цена — 86 рублей за штуку». Утверждение, а не "
        "вопрос: «может, 1080?» приглашает торговаться с цифрой.\n\n"
        "Источник: откуда цифра — сопоставимые объявления, прайсы трёх поставщиков, обзор "
        "зарплат по роли.\n\n"
        "Связка: почему этот источник уместен именно здесь — «та же модель, тот же год, "
        "похожий пробег».\n\n"
        "Цифру берите на краю того, что можете обосновать, а не за краем. Обоснованный якорь "
        "делает вашу систему координат общей: собеседнику приходится спорить уже не с вами, "
        "а с источником. Наглая цифра без основания («700!») не тянет сильнее — её просто "
        "отбрасывают, а вам потом отступать далеко и у всех на виду. Точность тоже работает "
        "на вас: «1075» звучит как расчёт, «1100» — как круглая просьба.\n\n"
        "В закупках это звучит так: «Предлагаем 86 рублей за штуку: три сопоставимых прайса на "
        "ту же позицию — 84, 86 и 89, мы взяли середину». Решать, брать ли первое слово "
        "вообще, помогает урок «Кто называет цифру первым» в блоке «Подготовка».",
        "An anchor with a criterion is three parts in one line.\n\n"
        "The position: “I propose 1080”, “our price is 86 per unit”. A statement, not a "
        "question: “maybe 1080?” invites haggling over the number.\n\n"
        "The source: where the number comes from — comparable listings, three suppliers' "
        "price lists, a salary survey for the role.\n\n"
        "The link: why that source fits this case — “same model, same year, similar "
        "mileage”.\n\n"
        "Pick a number at the edge of what you can justify, not beyond it. A grounded anchor "
        "makes your frame the shared one: the other side now has to argue with the source "
        "rather than with you. A brazen number with no grounds (“700!”) does not pull harder — "
        "it simply gets thrown out, and you then have to retreat a long way in plain sight. "
        "Precision helps too: “1075” sounds like a calculation, “1100” like a round wish.\n\n"
        "In procurement it sounds like this: “We propose 86 per unit: three comparable price "
        "lists for the same part say 84, 86 and 89, and we took the middle.” Whether to take "
        "the first word at all is covered in the “Who names a number first” lesson of the "
        "“Preparing for the Table” block.",
    ),
    phrases=(
        Phrase(
            T("Я предлагаю 1080: по трём объявлениям на такую же модель с этим пробегом медиана "
              "рынка именно такая.",
              "I propose 1080: across three comparable listings for the same model and mileage, "
              "the market median is exactly that."),
            moves=("anchor", "objective_criteria"),
        ),
        Phrase(
            T("Моя цена — 1075, не круглые 1100: это середина рыночного диапазона для этой модели "
              "с таким пробегом, от 1050 до 1100.",
              "My price is 1075, not a round 1100: that is the middle of the market price range "
              "for this model at this mileage, 1050 to 1100."),
            moves=("anchor", "objective_criteria"),
            when=T("Когда хотите, чтобы цифра звучала как расчёт.",
                   "When you want the number to sound like a calculation."),
        ),
        Phrase(
            T("Вот три сопоставимых объявления, я их сохранил. Моё предложение — 1080, это их "
              "середина.",
              "Here are three comparable listings, I saved them. My offer is 1080, that is their "
              "midpoint."),
            moves=("anchor", "objective_criteria"),
            when=T("Когда источник можно показать прямо сейчас.",
                   "When you can show the source right there."),
        ),
        Phrase(
            T("Я предлагаю 1080 с оплатой всей суммы сегодня: по рыночным ценам это честная "
              "цифра, а деньги вы получите сразу.",
              "I propose 1080 with the full amount paid today: at market prices that is a fair "
              "figure, and you get the money right away."),
            moves=("anchor", "objective_criteria"),
            when=T("Когда знаете, что продавцу важна скорость.",
                   "When you know speed matters to the seller."),
        ),
        Phrase(
            T("Если найдёте сопоставимую машину дешевле рынка — ту, что я пропустил, — покажите, "
              "я пересчитаю. Пока мой расчёт такой.",
              "If you find a comparable car I have missed, show me and I will redo the "
              "numbers. For now, that is my calculation."),
            moves=("objective_criteria",),
            when=T("Сразу после якоря — чтобы спор шёл об источнике, а не о вас.",
                   "Right after the anchor — so the argument is about the source, not about you."),
        ),
    ),
    dialog=Dialog(
        setup=T("Покупка машины с рук. Сергей поздоровался, а цифру не назвал — предлагает "
                "начать вам. Такие машины с похожим пробегом продаются за 1050–1100.",
                "Buying a used car. Sergey has said hello but named no figure — he wants you to "
                "start. Cars like this with similar mileage sell for 1050 to 1100."),
        opening=(
            them("Ну что, посмотрели машину? Сколько готовы дать?",
                 "So, you have had a look at the car. What are you prepared to pay?"),
        ),
        bad=(
            you("Даю 900.", "I will give you 900."),
            them("900? Несерьёзно. 1200 — и то я уступаю.",
                 "900? Not serious. 1200, and even that is me giving ground."),
            you("Ну, тогда 1000.", "Well, 1000 then."),
            them("1180, не ниже.", "1180, not a penny less."),
        ),
        bad_why=T(
            "Голая цифра, да ещё далеко за краем разумного. Сергей не стал её обсуждать: он "
            "отбросил её и назвал свою. Теперь на столе две крайности без оснований, вы уже "
            "отступили на сотню, а он на двадцатку. Первое слово было вашим — и потрачено "
            "впустую.",
            "A bare number, and far past the edge of reason at that. Sergey did not discuss it: "
            "he threw it out and named his own. Now the table holds two groundless extremes, "
            "you have already retreated by a hundred and he by twenty. The first word was "
            "yours — and it was wasted.",
        ),
        good=(
            you("Я предлагаю 1080. Вот на чём это основано: три объявления на такую же модель с "
                "похожим пробегом, медиана рынка — ровно 1080. Могу показать.",
                "I propose 1080. Here is what it is based on: three comparable listings for the "
                "same model with similar mileage, and the market median is exactly 1080. I can "
                "show you.",
                moves=("anchor", "objective_criteria")),
            them("Подготовились, вижу. Моя машина ухоженнее средней, так что медиана не про "
                 "неё. Но ладно — 1130, и давайте разговаривать.",
                 "You came prepared, I see. My car is better kept than average, so the median "
                 "does not apply to it. But fine — 1130, and let us talk."),
        ),
        good_why=T(
            "Цифра, источник и готовность показать — в одной реплике. Сергей не смог просто "
            "отбросить её: спорить пришлось с объявлениями. И начал он не с 1200, а с 1130 — "
            "первое слово сдвинуло всю рамку торга, и дальше вы идёте от неё. Заметьте: 1080 — "
            "не 900. Вы стоите на краю того, что можете обосновать, поэтому отступать далеко "
            "вам не придётся.",
            "The number, the source and an offer to show it — in one line. Sergey could not "
            "simply throw it out: he had to argue with the listings. And he started not at "
            "1200 but at 1130 — your first word moved the whole frame of the haggling, and you "
            "go on from there. Note that 1080 is not 900. You are standing at the edge of what "
            "you can justify, so you will not have to retreat far.",
        ),
    ),
    mistakes=(
        Mistake(
            T("Голая цифра", "A bare number"),
            T("Без источника цифра — просто ваше желание, и в ответ на неё называют своё "
              "желание. Две голые цифры — перетягивание каната, где побеждает упрямый, а не "
              "правый.",
              "Without a source a number is just your wish, and the answer is their wish. Two "
              "bare numbers make a tug of war, won by the stubborn rather than the right."),
        ),
        Mistake(
            T("Якорь за краем разумного", "An anchor past the edge of reason"),
            T("«700, потому что рынок» — цифру, которую не защитить, всё равно отбросят, а "
              "отступать от неё придётся долго и заметно. Каждое отступление показывает, что "
              "ваши цифры ничего не значат, — и следующей не поверят.",
              "“700, because that is the market” — a number you cannot defend gets thrown out "
              "anyway, and you then have to retreat a long way, visibly. Every retreat shows "
              "that your numbers mean nothing, and your next one will not be believed."),
        ),
        Mistake(
            T("Ставить якорь вопросом", "Setting the anchor as a question"),
            T("«Может, 1080?» — вопросительная интонация приглашает торговаться с цифрой, а не "
              "с источником. Утверждайте: «Я предлагаю 1080, и вот почему».",
              "“Maybe 1080?” — a questioning tone invites haggling over the number instead of "
              "the source. State it: “I propose 1080, and here is why.”"),
        ),
    ),
    limits=(
        Limit(
            T("У вас нет надёжной мерки, а собеседник знает рынок лучше вас.",
              "You have no reliable yardstick and the other side knows the market better."),
            T("Не ставьте якорь наугад. Отдайте первое слово и защищайтесь от чужой цифры "
              "приёмами урока 3: назвать якорь, спросить об основании, предложить мерку.",
              "Do not anchor at random. Hand over the first word and defend against their "
              "number with the moves from lesson 3: name the anchor, ask what it rests on, "
              "offer a yardstick."),
        ),
        Limit(
            T("Собеседник уже назвал свою цифру.", "The other side has already named a number."),
            T("Ваш якорь теперь встречный, и первое слово потрачено. Всё равно ставьте его с "
              "критерием, но сначала назовите чужой якорь якорем и спросите, на чём он стоит.",
              "Your anchor is now a counter, and the first word is spent. Still set it with a "
              "criterion, but first call their anchor an anchor and ask what it stands on."),
        ),
    ),
)
