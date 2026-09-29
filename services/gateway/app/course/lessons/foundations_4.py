"""Позиции и интересы · урок 4 — «Шкала „Информация“»."""

from app.course.lessons._model import (Dialog, LessonMaterial, Limit, Mistake,
                                       Phrase, T, them, you)

MATERIAL = LessonMaterial(
    block="foundations",
    lesson=4,
    scenario_id="rent",
    technique=T("Сначала узнать, потом предлагать",
                "Learn first, propose second"),
    why=T(
        "К переговорам готовятся как к выступлению: собирают доводы и в первые же минуты "
        "выкладывают их все — какой я надёжный, как упал рынок, сколько я готов платить. "
        "Пять минут речи, и вы не узнали о собеседнике ничего, а ваше предложение нацелено "
        "в догадку. Пока вы говорите, вы не узнаёте. Приём меняет порядок: сначала вопросы и "
        "паузы, потом короткий пересказ услышанного, и только потом — предложение, собранное "
        "из ответов.",
        "People prepare for a negotiation as if for a speech: they gather arguments and pour "
        "them all out in the first minutes — how reliable I am, how the market has dropped, "
        "how much I am willing to pay. Five minutes of talking, and you have learned nothing "
        "about the other side, while your offer is aimed at a guess. While you are talking, "
        "you are not learning. The technique changes the order: questions and pauses first, "
        "then a short retelling of what you heard, and only then an offer built from the "
        "answers.",
    ),
    core=T(
        "Правило одно: пока вы не услышали хотя бы одну причину за требованием собеседника, "
        "вы не предлагаете. Всё, что вы скажете раньше, — ставка вслепую.\n\n"
        "Держится правило на трёх привычках. Первая — вопрос и пауза. Задали вопрос — "
        "молчите: не подсказывайте ответ и не задавайте второй вопрос сверху. Три-четыре "
        "секунды тишины нормальны — человек думает, и самое ценное он часто говорит именно "
        "после паузы. Вторая — одна мысль на реплику. «Вопрос плюс рассказ о себе плюс "
        "цифра» — это три реплики, и собеседник ответит на самую удобную. Третья — пересказ "
        "перед предложением: «Правильно ли я понял, что главное — …». Он показывает, что "
        "предложение построено на ответах, и даёт шанс поправить вас до того, как вы "
        "назвали цифру.\n\n"
        "Простая мерка: вспомните свою последнюю реплику и посчитайте, сколько в ней "
        "утверждений и сколько вопросов. Утверждение, даже верное, не приносит вам ни одного "
        "нового факта.\n\n"
        "Пример со сроками подрядчика: он сорвал срок монтажа. Можно десять минут объяснять, "
        "насколько это недопустимо, — а можно спросить, что мешает, помолчать и узнать, что "
        "у него ушли два монтажника и он ищет замену. Теперь понятно, о чём договариваться: "
        "не о штрафе, а о людях.",
        "The rule is simple: until you have heard at least one reason behind the other "
        "side's demand, you do not propose. Anything you say before that is a blind bet.\n\n"
        "The rule rests on three habits. First, question and pause. Once you have asked, go "
        "quiet: do not suggest the answer and do not stack a second question on top. Three "
        "or four seconds of silence are normal — the person is thinking, and the most "
        "valuable thing is often said right after the pause. Second, one thought per line. "
        "“A question plus a story about yourself plus a number” is three lines, and the other "
        "side will answer the easiest one. Third, retell before you propose: “If I "
        "understand you right, the main thing is…”. It shows the offer is built on their "
        "answers and gives them a chance to correct you before you have named a number.\n\n"
        "A simple test: recall your last line and count the statements and the questions in "
        "it. A statement, even a true one, brings you no new facts.\n\n"
        "An example with a contractor's deadlines: they missed the installation date. You "
        "can spend ten minutes explaining how unacceptable that is — or ask what is getting "
        "in the way, stay quiet, and learn that two fitters have left and they are looking "
        "for replacements. Now you know what to negotiate: not a penalty, but people.",
    ),
    phrases=(
        Phrase(
            T("Прежде чем назову свою цифру, хочу понять вашу ситуацию. Что для вас важно в "
              "поиске жильцов?",
              "Before I name a number, I want to understand where you stand. What matters to "
              "you about vacancy?"),
            moves=("interests_probe",), reveals=True,
            when=T("В начале разговора, когда вас торопят с цифрой.",
                   "At the start, when you are being rushed for a number."),
        ),
        Phrase(
            T("Как у вас было с прошлыми жильцами — долго жили?",
              "How many months has the flat stood vacant in the last few years?"),
            moves=("spin_situation",), reveals=True,
            when=T("Вопрос о фактах: на него легко ответить даже осторожному человеку.",
                   "A question about facts: easy to answer even for a cautious person."),
        ),
        Phrase(
            T("Не тороплю — подумайте.", "No rush — take your time."),
            when=T("Если пауза после вопроса кажется вам неловкой. Скажите это и снова "
                   "замолчите.",
                   "If the pause after your question feels awkward. Say it, then go quiet "
                   "again."),
        ),
        Phrase(
            T("Правильно ли я понял: главное — чтобы квартира не простаивала и деньги "
              "приходили день в день?",
              "Let me make sure I have it right: the main thing is that the flat never "
              "stands empty and the money arrives on the same day each month?"),
            moves=("acknowledge",),
            when=T("Перед предложением: пересказ того, что услышали.",
                   "Before the offer: a retelling of what you heard."),
        ),
        Phrase(
            T("Что вам нужно от жильца, прежде чем мы заговорим о цифре?",
              "What do you need from a tenant before we get to the number — peace and "
              "quiet, or someone who stays?"),
            moves=("interests_probe",), reveals=True,
        ),
    ),
    dialog=Dialog(
        setup=T("Аренда. Наталья просит 75 тысяч в месяц. Вам нужно не дороже 70, а лучше 64.",
                "Renting. Natalia is asking 75k a month. You need 70k at most, and 64k ideally."),
        opening=(
            them("Здравствуйте. Квартира — 75 тысяч в месяц.",
                 "Hello. The flat is 75k a month."),
        ),
        bad=(
            you("Наталья, я человек аккуратный, работаю в офисе, дома бываю только вечером, "
                "животных нет. Плачу всегда вовремя. Сейчас рынок ниже, поэтому предлагаю 65.",
                "Natalia, I am a tidy person, I work in an office, I am only home in the "
                "evenings, no pets. I always pay on time. The market is lower right now, so "
                "I would offer 65.",
                moves=("offer",)),
            them("Все так говорят. Цена — 75.", "Everyone says that. The price is 75."),
        ),
        bad_why=T(
            "Вы угадали сразу три её интереса — тишину, порядок, оплату в срок, — но "
            "выложили их списком, как рекламу, и Наталья услышала «все так говорят». Какой из "
            "интересов главный, вы не знаете, а цифру уже назвали. Следующий шаг у вас "
            "остался один — уступать.",
            "You guessed three of her interests at once — quiet, tidiness, paying on time — "
            "but you laid them out as a list, like an advert, and Natalia heard “everyone "
            "says that”. You do not know which interest comes first, and you have already "
            "named a number. The only move left to you is to give ground.",
        ),
        good=(
            you("Прежде чем назову свою цифру, хочу понять вашу ситуацию. Что для вас важно в "
                "поиске жильцов?",
                "Before I name a number, I want to understand where you stand. What matters "
                "to you about vacancy?",
                moves=("interests_probe",), reveals=True),
            them("Чтобы квартира не простаивала. Последнего жильца я искала два месяца.",
                 "That the flat does not stand empty. It took me two months to find the last "
                 "tenant."),
            you("Не тороплю, подумайте. А в оплате что для вас важно?",
                "No rush, take your time. And what matters most to you about payments?",
                moves=("interests_probe",), reveals=True),
            them("Чтобы первого числа и без напоминаний. Я не люблю напоминать.",
                 "On the first, without reminders. I do not like chasing people."),
            you("Правильно ли я понял: главное — чтобы квартира не простаивала и деньги "
                "приходили день в день?",
                "Let me make sure I have it right: the main thing is that the flat never "
                "stands empty and the money arrives on the same day each month?",
                moves=("acknowledge",)),
            them("Да. И чтобы соседи не жаловались — это тоже.",
                 "Yes. And no complaints from the neighbours — that too."),
        ),
        good_why=T(
            "Три реплики — и ни одного утверждения о себе. Зато у вас два интереса, "
            "названные её словами, а пересказ принёс третий: Наталья сама добавила про "
            "соседей. Цифру вы ещё не назвали, и теперь назовёте её вместе с условиями, "
            "которые закрывают все три пункта.",
            "Three lines, and not one statement about yourself. Instead you have two "
            "interests in her own words, and the retelling brought a third: Natalia added the "
            "neighbours herself. You have not named a number yet, and now you will name it "
            "together with terms that cover all three points.",
        ),
    ),
    mistakes=(
        Mistake(
            T("Ответить на собственный вопрос",
              "Answering your own question"),
            T("«Что для вас важно в оплате? Наверное, чтобы вовремя, да?» Пауза была бы "
              "неловкой, и вы её заполнили — своей догадкой. Человек соглашается с ней из "
              "вежливости, а настоящий ответ вы так и не услышали. Спросили — молчите.",
              "“What matters to you about payments? On time, I suppose?” The pause felt "
              "awkward, so you filled it — with your own guess. They agree out of politeness, "
              "and you never hear the real answer. Once you have asked, stay quiet."),
        ),
        Mistake(
            T("Допрос вместо разговора",
              "An interrogation instead of a conversation"),
            T("Десять вопросов подряд без единого отклика на ответы — это анкета, и человек "
              "начинает отвечать короче. После ответа покажите, что услышали, — коротким "
              "пересказом или словом «понимаю», — и только потом задавайте следующий вопрос.",
              "Ten questions in a row with no response to the answers is a questionnaire, and "
              "the person starts answering more briefly. After each answer, show you heard it "
              "— a short retelling or an “I understand” — and only then ask the next one."),
        ),
        Mistake(
            T("Пересказать своё вместо услышанного",
              "Retelling your version instead of theirs"),
            T("«То есть вам просто нужны деньги побыстрее» — это не пересказ, а ваш вывод, "
              "и часто обидный. Пересказывайте её словами: «пустые месяцы», «без напоминаний». "
              "Если человек говорит «да, именно», пересказ удался; если «не совсем» — "
              "слушайте поправку, она ценнее первого ответа.",
              "“So you just want the money faster” is not a retelling but your conclusion, and "
              "often an offensive one. Retell in their words: “empty months”, “without "
              "reminders”. If they say “yes, exactly”, it worked; if they say “not quite”, "
              "listen to the correction — it is worth more than the first answer."),
        ),
    ),
    limits=(
        Limit(
            T("Собеседник сам ждёт предложения и прямо просит: «Назовите вашу цену».",
              "The other side is waiting for an offer and asks outright: “Name your price.”"),
            T("Бесконечно уходить от ответа нельзя — это выглядит как увёртка. Задайте "
              "один вопрос и объясните зачем: «Назову, только сначала один вопрос, чтобы "
              "предложить удобные вам условия». Если и после этого просят цифру — называйте, "
              "но обоснованную: об этом блок «Якорь и защита от него».",
              "You cannot dodge forever — it looks evasive. Ask one question and say why: "
              "“I will, just one question first so I can offer terms that suit you.” If they "
              "still want a number, give one — but a grounded one (see the “Anchoring & "
              "Counter-anchoring” block)."),
        ),
        Limit(
            T("Информация уже есть: вы готовились, знаете условия рынка и что нужно "
              "собеседнику.",
              "You already have the information: you prepared, you know the market and what "
              "the other side needs."),
            T("Не спрашивайте того, что знаете, — это звучит как проверка. Задайте один "
              "вопрос, чтобы подтвердить главную гипотезу («Правильно ли я понимаю, что "
              "вам важнее всего не простаивать?»), и переходите к предложению.",
              "Do not ask what you already know — it sounds like a test. Ask one question to "
              "confirm your main hypothesis (“Am I right that avoiding empty months matters "
              "most to you?”), then move to your offer."),
        ),
    ),
)
