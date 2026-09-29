"""Давление и возражения · урок 3 — «Термостат напряжения»."""

from app.course.lessons._model import (Dialog, LessonMaterial, Limit, Mistake,
                                       Phrase, T, them, you)

MATERIAL = LessonMaterial(
    block="pressure-defense",
    lesson=3,
    scenario_id="sla_renewal",
    technique=T("Сначала снизить напряжение, потом просить движения",
                "Cool the room before you ask for a move"),
    why=T(
        "В споре лучший довод хочется выложить на самом пике: «вот сейчас и докажу». Но "
        "разгорячённый человек не уступает, даже если внутри уже согласен: уступка на "
        "повышенных тонах выглядит как поражение. Ошибка — просить движения, пока в "
        "разговоре жарко. Приём: сначала потратить одну реплику на то, чтобы снизить "
        "напряжение, и только потом просить.",
        "In an argument you want to play your best card at the peak: “this is where I "
        "prove it”. But a heated person does not give ground even when, inside, they "
        "already agree: conceding in a raised voice looks like defeat. The mistake is to "
        "ask for movement while the room is hot. The technique: spend one line bringing "
        "the tension down first, and only then ask.",
    ),
    core=T(
        "Напряжение — это накал разговора: раздражение, ощущение, что на тебя давят, "
        "страх потерять лицо. Чем оно выше, тем меньше человек готов двигаться, и дело не "
        "в доводах: любое движение сейчас выглядит как сдача.\n\n"
        "Признаки: короткие резкие ответы, «сколько можно», «это не обсуждается», "
        "переход на «вы всегда», голос выше обычного.\n\n"
        "Три способа снизить накал. Признать: назвать, что происходит с человеком или с "
        "разговором, — «я вижу, что разговор стал жёстким» (урок «Назвать чувство, не "
        "соглашаясь»). Пауза: предложить перерыв на десять минут или вернуться к вопросу "
        "позже — это не слабость, а управление темпом. Общая задача: напомнить, ради чего "
        "оба за столом, — «нам обоим нужно, чтобы контракт продлился и работал без "
        "аварий».\n\n"
        "После этого — просьба, одна и конкретная, лучше в виде условия: «если мы… "
        "сможете ли вы…».\n\n"
        "Проверка перед просьбой: стали бы вы просить уступку у человека в таком "
        "состоянии, если бы это был ваш начальник? Если нет — сначала остудите.\n\n"
        "У подрядчика на стройке то же: прораб на взводе из-за задержки бетона. Сначала "
        "— «понимаю, бригада стоит, и это ваши деньги», потом — «давайте решим, как "
        "сдвинуть график на три дня, а не на неделю».",
        "Tension is the heat of the conversation: irritation, the sense of being pushed, "
        "the fear of losing face. The higher it is, the less willing a person is to move, "
        "and it is not about the arguments: any move right now looks like giving in.\n\n"
        "The signs: short sharp answers, “how many times”, “this is not up for "
        "discussion”, a switch to “you always”, a raised voice.\n\n"
        "Three ways to bring the heat down. Acknowledge: name what is happening to the "
        "person or to the conversation — “I can see this has got tense” (the lesson “Name "
        "the feeling without agreeing”). Pause: suggest a ten-minute break or coming back "
        "to the point later — that is not weakness, it is managing the pace. The shared "
        "task: remind both of you why you are at the table — “we both need this contract "
        "renewed and running without outages”.\n\n"
        "After that comes the request — one, and specific, ideally framed as a condition: "
        "“if we… could you…”.\n\n"
        "A check before you ask: would you ask your own boss for a concession in this "
        "state? If not, cool things down first.\n\n"
        "The same on a building site: the site manager is fuming about a late concrete "
        "delivery. First — “I understand, the crew is idle and it is your money”, then — "
        "“let us work out how to shift the schedule by three days rather than a week”.",
    ),
    phrases=(
        Phrase(
            T("Я вижу, что разговор стал жёстким. Давайте на минуту отложим проценты.",
              "I can see that this has got tense. Let us put the percentages aside for a "
              "minute."),
            moves=("acknowledge",),
            when=T("Признать: первая реплика на горячем столе.",
                   "Acknowledge: your first line when the room is hot."),
        ),
        Phrase(
            T("Предлагаю сделать перерыв на десять минут и вернуться к SLA со свежей головой.",
              "I suggest we take a ten-minute break and come back to the SLA with fresh "
              "heads."),
            when=T("Пауза: когда накал не спадает от слов.",
                   "Pause: when words are not bringing the heat down."),
        ),
        Phrase(
            T("Нам обоим нужно одно и то же: чтобы контракт продлился на годы и работал без "
              "аварий.",
              "We both need the same thing: a contract that renews for years and runs "
              "without outages."),
            when=T("Общая задача: вернуть вас на одну сторону стола.",
                   "Shared task: to put you both back on the same side of the table."),
        ),
        Phrase(
            T("Понимаю, вас беспокоят штрафы, и спорить об этом на повышенных тонах "
              "бессмысленно. Что для вас важнее — размер штрафов или их частота?",
              "I understand the penalties worry you, and arguing about them heatedly gets "
              "us nowhere. What matters more to you — the size of the penalties or how often "
              "they hit?"),
            moves=("acknowledge", "interests_probe"), reveals=True,
            when=T("Признать и сразу спросить — остужает и даёт информацию.",
                   "Acknowledge and ask at once — it cools things and gets you information."),
        ),
        Phrase(
            T("Теперь, когда стало спокойнее, сможете ли вы подвинуться до 99.7, если мы "
              "продлим договор на три года?",
              "Now that things are calmer, can you move to 99.7 if we renew for three "
              "years?"),
            moves=("tradeoff",),
            when=T("Просьба — только после того, как остыли.",
                   "The request — only once things have cooled."),
        ),
    ),
    dialog=Dialog(
        setup=T("Продление SLA. Вы уже дважды просили 99.8%, Виктор раздражён и повторяет "
                "своё.",
                "The SLA renewal. You have asked for 99.8% twice already; Viktor is "
                "irritated and keeps repeating himself."),
        state={"trust": 38, "tension": 62},
        opening=(
            them("Сколько можно! Я уже сказал: 99.5 и ни десятой больше.",
                 "How many times! I told you: 99.5 and not a tenth more."),
        ),
        bad=(
            you("Хорошо, последний довод: отраслевой стандарт — 99.9%, у нас простой стоит "
                "2.4 млн в час. Дайте хотя бы 99.8.",
                "Fine, one last argument: the industry standard is 99.9%, and our downtime "
                "costs 2.4m an hour. Give us at least 99.8.",
                moves=("objective_criteria",)),
            them("Стандарт оставьте себе для презентации. 99.5.",
                 "Keep the standard for your slide deck. 99.5."),
        ),
        bad_why=T(
            "Довод был хороший — отраслевой стандарт и цена вашего простоя. Но вы выложили "
            "его, когда Виктор кричал «сколько можно». На таком накале любая уступка для "
            "него — поражение, и лучший аргумент ушёл в пустоту. Второй раз его не "
            "потратить: повтор прозвучит как упрямство.",
            "The argument was a good one — the industry standard and what your downtime "
            "costs. But you played it while Viktor was shouting “how many times”. At that "
            "pitch any concession is a defeat for him, and your best argument went nowhere. "
            "You cannot spend it twice: a repeat will sound like stubbornness.",
        ),
        good=(
            you("Я вижу, что разговор стал жёстким, — давайте на минуту отложим проценты. "
                "Понимаю, вас беспокоят штрафы. Что для вас важнее — их размер или частота?",
                "I can see that this has got tense — let us put the percentages aside for a "
                "minute. I understand the penalties worry you. What matters more to you — "
                "their size or how often they hit?",
                moves=("acknowledge", "interests_probe"), reveals=True),
            them("Частота. Каждый ночной инцидент — это разбор у моего директора.",
                 "How often. Every night-time incident means a post-mortem with my director."),
            you("Тогда нам обоим нужно одно: меньше ночных инцидентов. Если мы продлим "
                "договор на три года и вложимся в совместное дежурство, сможете ли вы "
                "подвинуться до 99.7?",
                "Then we both need the same thing: fewer night-time incidents. If we renew "
                "for three years and invest in joint on-call, can you move to 99.7?",
                moves=("tradeoff",)),
            them("Три года и общее дежурство… 99.7 — это обсуждаемо.",
                 "Three years and shared on-call… 99.7 is something we can discuss."),
        ),
        good_why=T(
            "Вы не стали доказывать. Первая реплика остудила стол: вы назвали, что "
            "разговор стал жёстким, признали его страх и задали вопрос, на который легко "
            "ответить. Ответ дал общую задачу — меньше ночных инцидентов. Просьбу о 99.7 "
            "вы сделали только после этого и в виде условия. Тот же Виктор, что минуту "
            "назад кричал «ни десятой больше», сам сказал «обсуждаемо».",
            "You did not try to prove anything. Your first line cooled the table: you named "
            "that the talk had got tense, acknowledged his fear and asked a question that "
            "was easy to answer. The answer gave you a shared task — fewer night-time "
            "incidents. Only then did you ask for 99.7, and as a condition. The same Viktor "
            "who a minute earlier was shouting “not a tenth more” said “we can discuss it” "
            "himself.",
        ),
    ),
    mistakes=(
        Mistake(
            T("Выложить лучший довод на пике", "Playing your best argument at the peak"),
            T("Сильный аргумент на горячем столе сгорает, а повторить его потом нельзя — "
              "повтор звучит как упрямство. Придержите его до момента, когда человек сможет "
              "его услышать.",
              "A strong argument at a hot table burns up, and you cannot repeat it later — "
              "a repeat sounds like stubbornness. Hold it until the person can actually "
              "hear it."),
        ),
        Mistake(
            T("Остужать уступкой", "Cooling things down with a concession"),
            T("«Ладно-ладно, не будем ссориться, пусть 99.5». Напряжение спадёт, но за ваш "
              "счёт. Остужают признанием, паузой и общей задачей — не цифрой.",
              "“All right, all right, let us not fight, 99.5 it is.” The tension drops, but "
              "at your expense. You cool things with acknowledgement, a pause and a shared "
              "task — not with the number."),
        ),
        Mistake(
            T("Пауза как угроза", "A pause as a threat"),
            T("«Давайте прервёмся, а вы подумайте хорошенько». Это не перерыв, а ультиматум "
              "с отсрочкой. Пауза нужна обоим, и говорить о ней надо как о пользе для "
              "обоих.",
              "“Let us break, and you have a good think.” That is not a break; it is a "
              "deferred ultimatum. A pause is for both of you, and you should present it "
              "that way."),
        ),
    ),
    limits=(
        Limit(
            T("Накал нужен самому собеседнику: он давит намеренно или играет на публику — "
              "на своих коллег за столом.",
              "The other side wants the heat: they are pushing on purpose, or playing to an "
              "audience — their own colleagues at the table."),
            T("Остужать бесполезно, он разогреет снова. Не подыгрывайте: спокойно "
              "возвращайте разговор к цифрам и критериям и не отвечайте на тон (урок «Три "
              "ответа на ультиматум»).",
              "Cooling is pointless; he will heat it up again. Do not play along: calmly "
              "bring the talk back to numbers and criteria, and do not respond to the tone "
              "(the lesson “Three answers to an ultimatum”)."),
        ),
        Limit(
            T("Срок горит, перерыв невозможен — ответ нужен сегодня.",
              "The deadline is burning and a break is impossible — you need an answer "
              "today."),
            T("Пауза сжимается до одной фразы: признать накал и назвать общую задачу. Это "
              "десять секунд, и работает почти так же, как перерыв.",
              "The pause shrinks to one sentence: acknowledge the heat and name the shared "
              "task. It takes ten seconds and works almost as well as a break."),
        ),
    ),
)
