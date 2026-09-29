"""Слушание и деэскалация · урок 2 — «Отражение смысла»."""

from app.course.lessons._model import (Dialog, LessonMaterial, Limit, Mistake,
                                       Phrase, T, them, you)

MATERIAL = LessonMaterial(
    block="active-listening",
    lesson=2,
    scenario_id="conflict",
    technique=T("Пересказать смысл и проверить, правильно ли поняли",
                "Play back the meaning and check you got it right"),
    why=T(
        "Мы спорим с тем, что услышали, а не с тем, что нам сказали. Алексей кричит про "
        "сорванный срок, вы отвечаете про даты, а его на самом деле волнует, как это "
        "подадут директору. Полчаса разговора идут мимо друг друга. Приём: пересказать "
        "его мысль своими словами, без эмоции, и спросить, так ли это. Он либо "
        "подтвердит — и почувствует, что его услышали, — либо поправит, и поправка "
        "покажет, что для него важно на самом деле.",
        "We argue with what we heard, not with what was said. Alexey is shouting about a "
        "missed deadline, you answer about dates, and what actually bothers him is how "
        "this will be put to the director. Half an hour of talking past each other. The "
        "technique: play his thought back in your own words, without the emotion, and ask "
        "whether that is it. Either he confirms — and feels heard — or he corrects you, and "
        "the correction shows what really matters to him.",
    ),
    core=T(
        "Отражение смысла — не повтор слов, а пересказ сути: что человеку важно и почему. "
        "Эмоцию вы убираете, смысл оставляете. «Из-за вас я как дурак буду стоять перед "
        "директором» превращается в «правильно ли я понял, что для вас главное — как это "
        "будет выглядеть перед директором?».\n\n"
        "Три шага. Первый: выделить, о чём человек говорит на самом деле, а не о чём он "
        "кричит. Второй: сказать это короче и спокойнее, чем сказал он. Третий: закончить "
        "вопросом — «так?», «правильно?». Вопрос обязателен: без него пересказ звучит как "
        "ваш вывод о человеке, с ним — как проверка.\n\n"
        "Ошибиться здесь полезно. Если вы пересказали неверно, человек поправит вас и сам "
        "назовёт то, что для него важно: «Нет, директор ни при чём, у меня просто людей "
        "не хватает». Прямым вопросом вы бы это не вытянули — а поправку он даёт охотно.\n\n"
        "Пример из найма: кандидат говорит «ваш оффер несерьёзный». Пересказ: «Если я "
        "верно понял, дело не столько в сумме, сколько в том, что вы не видите, куда "
        "здесь расти?»",
        "Reflecting the meaning is not repeating words; it is retelling the substance: what "
        "matters to the person and why. You strip the emotion out and keep the meaning. "
        "“Thanks to you I will look like a fool in front of the director” becomes “if I "
        "understand you right, the main thing for you is how this will look to the "
        "director?”.\n\n"
        "Three steps. First, pick out what the person is actually talking about, rather "
        "than what they are shouting about. Second, say it shorter and calmer than they "
        "did. Third, finish with a question — “right?”, “is that it?”. The question is not "
        "optional: without it the playback sounds like your verdict on them; with it, it "
        "sounds like a check.\n\n"
        "Getting it wrong is useful here. If your playback is off, the person corrects you "
        "and names what matters to them on their own: “No, the director has nothing to do "
        "with it, I simply do not have enough people.” A direct question would not have "
        "got you that — a correction, people give gladly.\n\n"
        "A hiring example: a candidate says “your offer is not serious”. The playback: “If "
        "I understand correctly, it is less about the amount and more that you cannot see "
        "where you would grow here?”",
    ),
    phrases=(
        Phrase(
            T("Правильно ли я понял, что для вас важнее не сами сроки, а то, как это "
              "подадут руководству?",
              "If I understand you right, what matters more to you is not the dates "
              "themselves but how this is presented to leadership?"),
            moves=("acknowledge", "interests_probe"), reveals=True,
            when=T("Когда за криком про сроки слышно что-то ещё.",
                   "When you can hear something else behind the shouting about dates."),
        ),
        Phrase(
            T("Если я верно понял, у вас не хватает людей, и двадцать дней — это не "
              "прихоть, а реальная нагрузка на команду. Так?",
              "If I understand correctly, you are short of people, and twenty days is not "
              "a whim but the real load on your team. Is that right?"),
            moves=("acknowledge",),
            when=T("После того как он назвал причину: закрепить, что вы её услышали.",
                   "After he has named the reason: to show you have heard it."),
        ),
        Phrase(
            T("То есть вы готовы двигать дату, если руководство увидит, что это совместное "
              "решение, а не ваша ошибка?",
              "So you are saying you could move the date if leadership sees it as a joint "
              "decision rather than your mistake?"),
            moves=("acknowledge",),
            when=T("Чтобы превратить сказанное в условие, с которым можно работать.",
                   "To turn what he said into a condition you can work with."),
        ),
        Phrase(
            T("Давайте проверю, правильно ли я понял, — поправьте, если что-то не так.",
              "Let me make sure I understood you right — correct me if I got anything "
              "wrong."),
            moves=("acknowledge",),
            when=T("Перед длинным пересказом: так поправлять вас будет легче.",
                   "Before a longer playback: it makes correcting you easier."),
        ),
    ),
    dialog=Dialog(
        setup=T("Конфликт отделов. Алексей требует сдвинуть срок на двадцать дней. Вам "
                "нужно не больше пяти, а двенадцать — уже предел.",
                "A cross-team conflict. Alexey wants a twenty-day slip. You need five at "
                "most, and twelve is already your limit."),
        opening=(
            them("Двадцать дней — и это минимум. Вы сдали модуль сырым, и мне из-за вас "
                 "краснеть перед директором.",
                 "Twenty days, and that is the minimum. You handed over a half-baked module, "
                 "and I am the one who will be red-faced in front of the director."),
        ),
        bad=(
            you("Двадцать дней мы не можем. Нам нужно максимум пять.",
                "We cannot do twenty days. We need five at most."),
            them("Пять? Вы вообще слышите, что я говорю?",
                 "Five? Are you even listening to me?"),
            you("Слышу: вам нужно двадцать дней.",
                "Yes, I hear: you want twenty days."),
            them("Мне нужно, чтобы меня не сделали крайним!",
                 "What I need is not to be made the scapegoat!"),
        ),
        bad_why=T(
            "Вы ответили на цифру, которую он назвал на эмоциях, а когда он возмутился — "
            "повторили его слова. Повтор — не пересказ: он показывает, что вы услышали "
            "звук, но не смысл. Смысл Алексей выкрикнул сам в конце, и вытянули вы его "
            "ссорой, а не вопросом.",
            "You answered the number he threw out in anger, and when he objected you "
            "repeated his words back. Repeating is not playing back: it shows you heard the "
            "sound but not the meaning. Alexey shouted the meaning himself at the end — you "
            "got it out of him with a quarrel, not a question.",
        ),
        good=(
            you("Правильно ли я понял, что для вас важнее не сами двадцать дней, а то, как "
                "это подадут руководству?",
                "If I understand you right, what matters more to you is not the twenty days "
                "as such but how this is presented to leadership?",
                moves=("acknowledge", "interests_probe"), reveals=True),
            them("Не совсем. Руководство я переживу. У меня двое на больничном, а задач на "
                 "пятерых — вот в чём дело.",
                 "Not quite. I will survive leadership. I have two people off sick and work "
                 "for five — that is the real issue."),
            you("Если я верно понял, дело в людях: не хватает рук, а двадцать дней — "
                "следствие, а не цель. Так?",
                "If I understand correctly, it is about people: you are short-handed, and "
                "the twenty days are a consequence, not the goal. Right?",
                moves=("acknowledge",)),
            them("Именно. Дайте мне человека на две недели — и я сокращу сдвиг.",
                 "Exactly. Give me one person for two weeks and I will cut the slip."),
        ),
        good_why=T(
            "Вы пересказали смысл и спросили, так ли это. И ошиблись — но ошибка "
            "сработала: поправляя вас, Алексей сам назвал настоящую причину, нехватку "
            "людей. Вторым пересказом вы показали, что услышали, и он тут же предложил "
            "выход, о котором вы бы не догадались спросить.",
            "You played back the meaning and asked whether that was it. You were wrong — "
            "and being wrong worked: correcting you, Alexey named the real reason himself, a "
            "shortage of people. Your second playback showed you had heard him, and he "
            "immediately offered a way out you would never have thought to ask about.",
        ),
    ),
    mistakes=(
        Mistake(
            T("Повторять слово в слово", "Repeating word for word"),
            T("«Вам нужно двадцать дней» — человек слышит, что его передразнивают или "
              "тянут время. Пересказ короче и точнее оригинала и называет не что человек "
              "требует, а зачем.",
              "“You want twenty days” — the person hears mimicry or stalling. A playback is "
              "shorter and sharper than the original, and it names not what they demand "
              "but why."),
        ),
        Mistake(
            T("Пересказать и не спросить", "Playing back without asking"),
            T("«Понятно, вам важно, как это подадут наверх» звучит как ваш вывод о нём, а "
              "выводы о себе люди не любят и начинают оспаривать. Вопрос в конце — «так?», "
              "«правильно?» — оставляет последнее слово за ним.",
              "“Right, so what matters to you is how it looks upstairs” sounds like your "
              "verdict on him, and people dislike verdicts about themselves and start "
              "disputing them. A question at the end — “right?”, “is that it?” — leaves the "
              "last word with him."),
        ),
        Mistake(
            T("Вложить в пересказ своё мнение", "Slipping your opinion into the playback"),
            T("«То есть вы хотите переложить вину на нас?» — это не пересказ, а обвинение в "
              "форме вопроса. Проверка простая: подписался бы он под вашей формулировкой? "
              "Если нет — вы пересказали себя, а не его.",
              "“So you want to shift the blame onto us?” is not a playback; it is an "
              "accusation dressed as a question. The test is simple: would he sign under "
              "your wording? If not, you played back yourself, not him."),
        ),
    ),
    limits=(
        Limit(
            T("Собеседник говорит коротко и по делу, и всё уже ясно.",
              "The other side is brief and to the point, and everything is already clear."),
            T("Пересказ каждой фразы тормозит разговор и раздражает. Отражайте только то, "
              "от чего зависит решение, — обычно одно место за разговор, перед "
              "предложением.",
              "Playing back every sentence slows things down and irritates. Reflect only "
              "what the decision hinges on — usually one point per conversation, just "
              "before you make an offer."),
        ),
        Limit(
            T("Человек на пике злости, почти кричит.",
              "The person is at the peak of their anger, close to shouting."),
            T("Пересказ «по делу» сейчас прозвучит холодно. Сначала назовите чувство "
              "(урок «Назвать чувство, не соглашаясь»), а смысл пересказывайте, когда он "
              "сможет слушать.",
              "A businesslike playback will sound cold right now. Name the feeling first "
              "(the lesson “Name the feeling without agreeing”), and play back the meaning "
              "once he is able to listen."),
        ),
    ),
)
