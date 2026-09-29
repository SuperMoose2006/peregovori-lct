"""Размен и создание ценности · урок 2 — «Матрица „дёшево мне / дорого им“»."""

from app.course.lessons._model import (Dialog, LessonMaterial, Limit, Mistake,
                                       Phrase, T, them, you)

MATERIAL = LessonMaterial(
    block="logrolling",
    lesson=2,
    scenario_id="supplier",
    technique=T("Отдавать то, что дёшево вам и ценно им",
                "Give what is cheap for you and valuable to them"),
    why=T(
        "Уступают обычно то, что первым пришло в голову, или то, о чём громче просят. "
        "Закупщик соглашается на предоплату, «чтобы показать добрую волю», и получает "
        "за неё рубль скидки — а деньги компании на два месяца заморожены. Приём лечит "
        "эту привычку: у каждого условия две цены — сколько оно стоит вам и сколько оно "
        "стоит им, — и меняться выгодно там, где эти цены сильнее всего расходятся.",
        "People usually concede whatever comes to mind first, or whatever is asked for "
        "loudest. A buyer agrees to prepayment “as a sign of goodwill” and gets a rouble "
        "off for it — while the company's money is frozen for two months. This technique "
        "breaks the habit: every term has two prices — what it costs you and what it is "
        "worth to them — and trading pays where those two prices differ the most.",
    ),
    core=T(
        "Принцип обмена уступками «дёшево мне, ценно тебе»: вы отдаёте то, что вам почти "
        "ничего не стоит, а собеседнику важно, и просите взамен то, что важно вам. Для "
        "этого по ходу разговора держите в голове простую таблицу: условие, сколько оно "
        "стоит вам, сколько оно стоит им. Хватит трёх отметок: мало, средне, много.\n\n"
        "У стола с поставщиком две такие фишки. Годовой контракт с гарантией объёма вам "
        "стоит мало — вы и так закупаете весь год, — а для Ирины это загрузка "
        "производства: много. Идеальная фишка. Предоплата 30% ей полезна, но вам "
        "замораживает оборотные деньги: средне против среднего, посредственная фишка.\n\n"
        "Свою колонку вы знаете. Чужую узнаёте только вопросами и по реакции: где "
        "собеседник оживился, переспросил, начал считать вслух — там для него ценно. "
        "Меняйтесь в порядке разрыва: сначала то, где «мне дёшево» и «им дорого» дальше "
        "всего друг от друга. Отдать первым дорогое для себя — значит потратить запас на "
        "полдороге.\n\n"
        "В найме так же: два удалённых дня в неделю компании почти ничего не стоят, а "
        "кандидату ценны. Плюс двадцать тысяч к окладу компании дороги каждый месяц.",
        "The “cheap for me, valuable to you” principle of trading concessions: you give "
        "what costs you almost nothing but matters to the other side, and ask in return "
        "for what matters to you. To do that, keep a simple table in your head as you "
        "talk: the term, what it costs you, what it is worth to them. Three marks are "
        "enough: low, medium, high.\n\n"
        "At the supplier's table there are two such chips. An annual contract with a "
        "volume guarantee costs you little — you buy all year anyway — while for Irina it "
        "means a loaded factory: high. The perfect chip. A 30% prepayment helps her but "
        "freezes your working capital: medium against medium, a mediocre chip.\n\n"
        "Your own column you know. Theirs you learn only by asking and by watching: where "
        "the other side perks up, asks again, starts counting out loud — that is where the "
        "value is for them. Trade in order of the gap: first where “cheap for me” and "
        "“valuable to them” are furthest apart. Giving away what is expensive for you "
        "first spends your reserves halfway.\n\n"
        "Hiring works the same way: two remote days a week cost the company next to "
        "nothing and matter to the candidate. Twenty thousand more on the salary costs the "
        "company every month.",
    ),
    phrases=(
        Phrase(
            T("Что для вас важнее: загрузка производства на год вперёд или предоплата 30%?",
              "What matters more to you: keeping the factory loaded a year ahead, or 30% "
              "upfront?"),
            moves=("interests_probe",), reveals=True,
            when=T("Узнать, какая из двух фишек весит для неё больше.",
                   "To learn which of two chips weighs more for her."),
        ),
        Phrase(
            T("Сколько для вас стоит гарантия объёма на год — насколько это меняет вашу "
              "цену?",
              "How much is an annual contract with guaranteed volume worth to you — how far "
              "does it change your price?"),
            moves=("spin_situation",), reveals=True,
            when=T("Попросить её саму оценить фишку, прежде чем вы её предложите.",
                   "To get her to price the chip herself before you offer it."),
        ),
        Phrase(
            T("Мы можем делиться прогнозом спроса на квартал вперёд. Насколько это было бы "
              "полезно вашему производству?",
              "We could share our demand forecast a quarter ahead. How valuable would that "
              "be for your production?"),
            moves=("spin_needpayoff",), reveals=True,
            when=T("Проверить ценность новой фишки, не отдавая её.",
                   "To test the value of a new chip without giving it away."),
        ),
        Phrase(
            T("Предоплата для нас — дорогое условие: это деньги, замороженные на два месяца. "
              "Поэтому говорить о ней можно только вместе с ценой.",
              "Prepayment is expensive for us: that is money frozen for two months. So we "
              "can only discuss it together with the price."),
            when=T("Назвать, чего вам стоит условие, если его просят как мелочь.",
                   "To name what a term costs you when it is asked for as a trifle."),
        ),
        Phrase(
            T("Я вижу, что при слове «годовой» вы оживились. Правильно ли я понял, что "
              "объём на год для вас важнее предоплаты?",
              "I can see that the word annual caught your attention. If I understand you "
              "right, an annual volume matters more to you than prepayment?"),
            moves=("acknowledge",),
            when=T("Сверить свою догадку о её колонке с ней самой.",
                   "To check your guess about her column with her."),
        ),
    ),
    dialog=Dialog(
        setup=T("Закупки. Ирина держит 97 ₽ за штуку. Возможные фишки — годовой контракт с "
                "гарантией объёма и предоплата 30%.",
                "Procurement. Irina is holding at 97 per unit. The chips in play are an "
                "annual volume commitment and a 30% prepayment."),
        opening=(
            them("97 — это мой предел, если без дополнительных условий.",
                 "97 is my limit, unless there are extra terms."),
        ),
        bad=(
            you("Хорошо, мы готовы на предоплату 30%. Теперь сбросите цену?",
                "Fine, we are ready to do 30% upfront. Now will you drop the price?"),
            them("Предоплата — это приятно. Могу 96.",
                 "Prepayment is nice. I can do 96."),
            you("Всего рубль? Ладно, берите и годовой контракт.",
                "Just one rouble? All right, have the annual contract as well."),
            them("С годовым — 94. Это всё.", "With the annual one — 94. That is it."),
        ),
        bad_why=T(
            "Первой вы отдали самую дорогую для себя фишку — замороженные деньги — и "
            "купили на неё рубль. Лучшую фишку отдали вдогонку, даже не узнав, что она для "
            "Ирины значит. Итог — 94, и меняться больше нечем.",
            "You gave away the chip that is most expensive for you first — frozen cash — and "
            "bought one rouble with it. The best chip went as an afterthought, without "
            "finding out what it means to Irina. The result is 94, and nothing is left to "
            "trade.",
        ),
        good=(
            you("Прежде чем что-то предлагать: что для вас важнее — загрузка производства на "
                "год вперёд или предоплата 30%?",
                "Before I offer anything: what matters more to you — keeping the factory "
                "loaded a year ahead, or 30% upfront?",
                moves=("interests_probe",), reveals=True),
            them("Загрузка, конечно. Летом линия простаивает. Предоплата — приятно, но не "
                 "главное.",
                 "Keeping it loaded, of course. The line stands idle in summer. Prepayment "
                 "is nice, but not the main thing."),
            you("Понимаю: объём вам ценнее. Предоплата для нас дорогая — это замороженные "
                "деньги, поэтому её оставим в стороне. Давайте говорить о цене вместе с "
                "годовым объёмом.",
                "I understand: the volume matters more to you. Prepayment is expensive for "
                "us — it is frozen money — so let us set it aside. Let us talk about the "
                "price together with an annual volume.",
                moves=("acknowledge",)),
            them("С гарантией объёма на год я готова обсуждать 90 и ниже.",
                 "With a guaranteed annual volume I am ready to talk about 90 and below."),
        ),
        good_why=T(
            "Вы сначала узнали её колонку, а не гадали. Ирина сама сказала, что загрузка "
            "для неё важнее предоплаты, — значит, годовой объём стоит дорого, и цену за "
            "него назовёт она. Дорогую для себя предоплату вы не отдали и объяснили почему, "
            "так что она не выглядит жадностью.",
            "You learned her column first instead of guessing. Irina said herself that a "
            "loaded line matters more to her than prepayment — so the annual volume is worth "
            "a lot, and she will be the one to put a price on it. You kept the prepayment "
            "that is expensive for you and said why, so it does not look like greed.",
        ),
    ),
    mistakes=(
        Mistake(
            T("Судить о ценности по себе",
              "Judging value by your own yardstick"),
            T("«Годовой контракт мне ничего не стоит — значит, и ей он неважен». Цена для "
              "вас и ценность для них — два разных числа. Первое знаете вы, второе — только "
              "спросив.",
              "“An annual contract costs me nothing, so it cannot matter to her.” The cost "
              "to you and the value to them are two different numbers. You know the first; "
              "the second you only learn by asking."),
        ),
        Mistake(
            T("Отдать дорогое первым «для доброй воли»",
              "Giving the expensive thing first “as goodwill”"),
            T("Добрая воля заканчивается на первой же уступке, а замороженные деньги "
              "остаются. Начинайте с фишки, где разрыв больше, — она покупает больше.",
              "Goodwill ends with the first concession; the frozen cash stays frozen. Start "
              "with the chip where the gap is widest — it buys the most."),
        ),
        Mistake(
            T("Сказать вслух, что вам это ничего не стоит",
              "Saying out loud that it costs you nothing"),
            T("«Годовой контракт нам вообще без разницы». После этого он и для неё "
              "перестаёт быть уступкой. Говорите, чем условие для вас является: «мы берём "
              "на себя обязательство по объёму на год».",
              "“We really do not care about the annual contract.” After that it stops being "
              "a concession in her eyes too. Say what the term means for you: “we are "
              "taking on a volume commitment for a whole year”."),
        ),
    ),
    limits=(
        Limit(
            T("Дешёвых для вас условий нет: всё, чего просит собеседник, вам дорого.",
              "There are no cheap terms for you: everything the other side asks for is "
              "expensive."),
            T("Не выдумывайте фишки. Работайте с ценой через внешние цифры — прайсы "
              "сопоставимых поставщиков — и через свою альтернативу.",
              "Do not invent chips. Work on the price through outside figures — prices of "
              "comparable suppliers — and through your alternative."),
        ),
        Limit(
            T("Собеседник не говорит, что ему ценнее, и отвечает: «Важно всё».",
              "The other side will not say what matters more and answers: “Everything "
              "matters.”"),
            T("Предложите два варианта с разными условиями и посмотрите, какой выберут, — "
              "об этом урок 3 этого блока. Выбор покажет колонку «ценно им» точнее ответа.",
              "Offer two versions with different terms and see which one they pick — lesson "
              "3 of this block covers it. The choice shows the “valuable to them” column "
              "more precisely than an answer would."),
        ),
    ),
)
