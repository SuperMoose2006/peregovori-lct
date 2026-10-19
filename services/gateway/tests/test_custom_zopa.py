"""test_custom_zopa.py — ZOPA сгенерированного сценария обязана быть такой же
тугой, как у рукотворных: иначе грейд «своей сделки» несопоставим с грейдом
тренировки, а сопоставимость — то, ради чего счёт вообще считает движок.

Функция чистая, сеть не нужна — тесты офлайн (conftest ставит NEGO_AI=off).
"""
def test_generated_zopa_is_as_tight_as_handmade():
    """Дно оппонента обязано стоять ВПЛОТНУЮ к цели игрока, а не в краю диапазона.

    Сортировка чисел гарантирует играбельность, но раньше ставила дно в крайнюю
    точку: оппонент был готов уйти далеко за цель, и цель бралась почти даром.
    Замер: одна и та же сильная игра давала в своей сделке экономику 100 и общий
    72 против 76 и 62 в рукотворных сценариях. Десять баллов разницы означают,
    что грейд «своей сделки» несопоставим с грейдом тренировки.

    Порог 25% взят с запасом к медиане рукотворных (14.3%).
    """
    from app.ai.scenario_gen import _normalize_zopa

    for dir_ in ("lower_is_better", "higher_is_better"):
        opp_open, opp_res, target, player_res = _normalize_zopa({
            "opponent_open": 100, "opponent_reservation": 10,
            "player_target": 60, "player_reservation": 80, "dir": dir_,
        })
        span = abs(opp_open - target)
        beyond = abs(opp_res - target)
        assert span > 0, "вырожденный диапазон"
        assert beyond <= span * 0.25, (
            f"{dir_}: дно оппонента ушло на {beyond / span:.0%} за цель — "
            f"цель берётся слишком дёшево, грейд несопоставим"
        )
        # Играбельность не должна пострадать: цель обязана оставаться достижимой.
        if dir_ == "lower_is_better":
            assert opp_res <= target < player_res < opp_open
        else:
            assert opp_open < player_res < target <= opp_res


def test_the_described_target_survives_normalisation():
    """CE-01, причина в коде (найдено после аудита 17.10). Дно модели шло в
    сортировку и потом всё равно перезаписывалось из цели — его единственным
    следом был сдвиг остальных: «старт 530 000, дно 470 000, цель 450 000,
    предел 500 000» давало цель 470 000, ровно как в аудите."""
    from app.ai.scenario_gen import _normalize_zopa
    o, r, t, p = _normalize_zopa({"dir": "lower_is_better", "opponent_open": 530000,
                                  "opponent_reservation": 470000, "player_target": 450000,
                                  "player_reservation": 500000})
    assert (o, t, p) == (530000, 450000, 500000)
    assert r <= t, "цель обязана быть достижимой: дно оппонента не выше цели"
    o, r, t, p = _normalize_zopa({"dir": "higher_is_better", "opponent_open": 180,
                                  "opponent_reservation": 230, "player_target": 250,
                                  "player_reservation": 200})
    assert (o, t, p) == (180, 250, 200) and r >= t
