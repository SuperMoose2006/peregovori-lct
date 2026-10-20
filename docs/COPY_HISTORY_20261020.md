# Тексты сайта: старые версии (правка 20.10.2026)

Правка по голосовым Маши 20.10. Здесь — что стояло ДО неё, чтобы любую
строку можно было вернуть. Слева «было», ниже «стало».

## Главная (`frontend/src/components/ScenarioPicker.tsx`)

**Заголовок**
- Было: «Договариваться — навык. Тренируйте его здесь.»
- Стало: «Договариваться — это навык. Тренируйте его здесь.»
- EN было: «Negotiation is a skill. Make it yours.»
- EN стало: «Negotiating is a skill. Practise it here.»

**Подзаголовок**
- Было: «Вы ведёте переговоры с собеседником, которого играет ИИ: у него своя цена, граница и скрытые интересы. Договоритесь выгодно и не испортите отношения — после партии получите разбор и оценку.»
- Стало: «Здесь вы тренируете навык переговоров с ИИ-собеседником, у которого свои цели на разговор. Ваша задача — успешно выстроить диалог и прийти к договорённости. После каждой партии вы получаете подробный разбор и оценку.»
- EN было: «You negotiate with a counterpart played by AI: they have their own price, a limit and hidden interests. Reach a good deal without damaging the relationship — after the game you get a breakdown and a grade.»
- EN стало: «Here you practise negotiating with an AI counterpart who has their own goals for the conversation. Your job is to build the dialogue well and reach an agreement. After every game you get a detailed breakdown and a grade.»

## Карл, первый шаг тура (`i18n.ts`, `tours.home.intro.body`)

- Было: «Вы ведёте переговоры с собеседником, которого играет ИИ: у него своя цена, граница, за которую он не пойдёт, и скрытые интересы. Задача — договориться выгодно и не испортить отношения. После партии — разбор ошибок и оценка от A до F.»
- Стало: «Вы ведёте переговоры с собеседником, которого играет ИИ. У него свои цели, границы, которые он не готов переходить, и скрытые интересы. Ваша задача — договориться выгодно, учитывая интересы обеих сторон. После каждой партии вы получаете подробный разбор и оценку.»
- EN было: «You negotiate with a counterpart played by AI: they have their own price, a limit they won't go past, and hidden interests. Your job is to reach a good deal without damaging the relationship. After each game you get a breakdown of your moves and a grade from A to F.»
- EN стало: «You negotiate with a counterpart played by AI. They have their own goals, limits they won't cross, and hidden interests. Your job is to reach a good deal that takes both sides' interests into account. After every game you get a detailed breakdown and a grade.»

## Карточки ситуаций (`frontend/src/data/scenarios.ts`, поле `role`)

| Ситуация | Было | Стало |
|---|---|---|
| Контракт с поставщиком | Вы — менеджер по закупкам: снизить цену, не потеряв надёжного поставщика. | Вы — менеджер по закупкам. Вам нужно снизить цену, не потеряв надёжного поставщика. |
| Переговоры о зарплате | У вас есть оффер: повысить компенсацию, не отпугнув работодателя. | Ваша задача — договориться с работодателем о повышении зарплаты. |
| Раунд с инвестором | Вы — фаундер: инвестор хочет большую долю и жёсткие условия. | Вы — фаундер. Ваша задача — договориться с инвестором, который хочет большую долю. |
| Аренда квартиры | Вы — арендатор: снизить месячную плату, не потеряв удачную квартиру. | Вы — арендатор. Вам нужно снизить месячную плату, не потеряв удачную квартиру. |
| Ставка фрилансера | Вы — независимый разработчик: поднять дневную ставку по проекту для стартапа. | Вы — независимый разработчик. Вам нужно поднять дневную ставку по проекту для стартапа. |
| Оффер сильному кандидату | Вы нанимаете: бюджет с запасом, второго оффера у него нет. Пусть выйдет — и останется. | Ваша задача — уговорить кандидата принять ваши условия по зарплате. |

EN:

| Ситуация | Было | Стало |
|---|---|---|
| Supplier Contract | You are a buyer: cut the price without losing a reliable supplier. | You are a buyer. You need to cut the price without losing a reliable supplier. |
| Salary Negotiation | You have an offer: raise the package without scaring off the employer. | Your task: agree with the employer on a higher salary. |
| Investor Term Sheet | You are a founder: the investor wants a big stake and tough terms. | You are a founder. Your task: reach a deal with an investor who wants a big stake. |
| Apartment Rent | You are a tenant: lower the monthly rent without losing a great flat. | You are a tenant. You need to lower the monthly rent without losing a great flat. |
| Freelance Rate | You are an independent developer: raise your project day rate with a startup. | You are an independent developer. You need to raise your day rate on a startup project. |
| Making the Offer | You are hiring: the budget has room, he has no rival offer. Make him join — and stay. | Your task: persuade the candidate to accept your salary terms. |

## Вводная за столом (`services/gateway/app/engine/scenarios.py`, поле `role`)

| Ситуация | Было | Стало |
|---|---|---|
| Контракт с поставщиком | Вы — менеджер по закупкам. Нужно снизить цену на комплектующие, не потеряв надёжного поставщика. | Вы — менеджер по закупкам. Вам нужно снизить цену на комплектующие, не потеряв надёжного поставщика. |
| Переговоры о зарплате | Вы получили оффер и хотите повысить компенсацию, не отпугнув работодателя. | Вы получили оффер. Ваша задача — договориться с работодателем о повышении зарплаты. |
| Раунд с инвестором | Вы — фаундер. Инвестор предлагает деньги, но хочет большую долю и жёсткие условия. | Вы — фаундер компании. Ваша задача — договориться с инвестором, который хочет большую долю компании и жёсткие условия. |
| Аренда квартиры | Вы — арендатор. Хотите снизить месячную арендную плату, не потеряв удачную квартиру. | Вы — арендатор. Вам нужно снизить месячную плату, не потеряв удачную квартиру. |
| Ставка фрилансера | Вы — независимый разработчик. Хотите поднять дневную ставку по проекту для стартапа. | Вы — независимый разработчик. Вам нужно поднять дневную ставку по проекту для стартапа. |
| Оффер сильному кандидату | Вы — нанимающий руководитель. Бюджет утверждён с запасом, второго оффера у кандидата нет. Договоритесь так, чтобы он вышел — и остался. | Вы — нанимающий руководитель. Ваша задача — уговорить кандидата принять ваши условия по зарплате. Бюджет утверждён с запасом, второго оффера у кандидата нет. |

EN было → стало:
- Salary: «You have an offer and want to raise the package without scaring off the employer.» → «You have received an offer. Your task: agree with the employer on a higher salary.»
- Investor: «You are a founder. The investor offers money but wants a large stake and tough terms.» → «You are a company founder. Your task: reach a deal with an investor who wants a large stake in the company and tough terms.»
- Offer: «You are the hiring manager. The budget has room, the candidate has no rival offer. Close it so he joins — and stays.» → «You are the hiring manager. Your task: persuade the candidate to accept your salary terms. The budget has room, and the candidate has no rival offer.»

## Правая колонка (`i18n.ts`)

**Цель на сегодня — правило**
- Было: «Поднять цель можно сразу, опустить — только со следующего дня: обещание себе не отменяют посреди дня.»
- Стало: «Поднять цель можно сразу, опустить — только со следующего дня.»
- EN было: «You can raise the goal right away; lowering it starts tomorrow — a promise to yourself isn't taken back halfway through the day.»
- EN стало: «You can raise the goal right away; lowering it starts tomorrow.»

**Ваш ранг — подсказка**
- Было: «Растёт от опыта (XP). За законченную партию — столько XP, сколько баллов из 100 вы набрали, плюс бонус за сделку и за новый рекорд; задания курса тоже дают XP. На оценку партий ранг не влияет.»
- Стало: «Вы получаете столько XP, сколько баллов из 100 набрали за законченную партию, плюс бонус за сделку и за новый рекорд. Задания курса тоже дают XP. На оценку партии ранг не влияет.»
- EN было: «Grows with experience (XP). A finished game earns as much XP as its score out of 100, plus a bonus for a deal and for a new record; course exercises earn XP too. Your rank never affects how games are scored.»
- EN стало: «You earn as much XP as you scored out of 100 in a finished game, plus a bonus for a deal and for a new record. Course exercises earn XP too. Your rank never affects how a game is scored.»

**Четыре главных приёма — «Объективные критерии», пример**
- Было: «… это законный рычаг: чип «Рыч» под репликой растёт, а уступка не выглядит капитуляцией.»
- Стало: «… это законный рычаг: отметка «Рычаг» под репликой растёт, а уступка не выглядит капитуляцией.»
- EN: «the “Lev” chip under your line rises» → «the “Leverage” mark under your line rises»

**Четыре главных приёма — «Запасной вариант как рычаг»**
- Метка было: «BATNA» → стало: «Гарвард» (EN: «BATNA» → «Harvard»)
- Пример было: «… Но угроза «уйду» в лоб бьёт по доверию: BATNA — рычаг, а не таран.»
- Пример стало: «… Но угроза «уйду» в лоб бьёт по доверию: запасной вариант — рычаг, а не таран.»
- EN: «BATNA is leverage, not a battering ram.» → «your fallback is leverage, not a battering ram.»

**Подсказка шкалы «Гибкость»**
- Было: «… и силы ваших доводов (рычаг, чип «Рыч»); напряжение её съедает.»
- Стало: «… и силы ваших доводов (рычаг); напряжение её съедает.»
- EN: «(leverage, the “Lev” chip)» → «(leverage)»

## Метки под репликами за столом (`Table.tsx`)

- Было: сокращения «Дов / Напр / Инфо / Рыч» (EN «Trust / Tens / Info / Lev»).
- Стало: полные названия «Доверие / Напряжение / Информация / Рычаг» (EN «Trust / Tension / Information / Leverage»).
- Вернуть: в `Table.tsx` передать в `Chat` `metersShort={t.metersShort}` вместо `t.meters`.
