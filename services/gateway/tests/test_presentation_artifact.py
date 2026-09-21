"""Delivery contract for the offline morning deck, not a design quality score."""
from html.parser import HTMLParser
from pathlib import Path


def test_deck_has_required_sections_and_no_external_runtime():
    path = Path(__file__).resolve().parents[3] / 'docs/presentation.html'
    text = path.read_text()

    class Deck(HTMLParser):
        slides = []
        dependencies = []

        def handle_starttag(self, tag, attrs):
            attrs = dict(attrs)
            if tag == 'section': self.slides.append(attrs.get('id'))
            if tag in ('script', 'link', 'img'):
                self.dependencies.append(attrs.get('src', attrs.get('href', '')))

    deck = Deck()
    deck.feed(text)
    assert deck.slides == [f's{i}' for i in range(1, 10)]
    assert not deck.dependencies, 'the morning deck must open without a network or runtime'
    for required in ['Команда', 'слайд 8', 'слайд 9', 'слайд 10', 'слайд 11',
                     'Настройка → переговоры → разбор', 'Границы MVP', 'План развития']:
        assert required in text
    assert 'Достоверных реквизитов пока нет' in text
    assert '@media print' in text
