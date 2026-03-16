from app.engine.emotion import analyze_emotion
from app.engine.sentence_splitter import split_sentences


class TestEmotionAnalyzer:
    def test_happy_korean(self):
        assert analyze_emotion("오늘 기분이 너무 좋아요!") == "happy"

    def test_happy_english(self):
        assert analyze_emotion("I'm so happy today!") == "happy"

    def test_sad_korean(self):
        assert analyze_emotion("너무 슬프다 ㅠㅠ") == "sad"

    def test_angry_korean(self):
        assert analyze_emotion("정말 짜증나고 화나네") == "angry"

    def test_surprised_korean(self):
        assert analyze_emotion("헐 대박 진짜?") == "surprised"

    def test_neutral_no_keywords(self):
        assert analyze_emotion("오늘 날씨는 맑습니다") == "neutral"

    def test_neutral_empty(self):
        assert analyze_emotion("") == "neutral"

    def test_dominant_emotion(self):
        # "happy" keywords: 기쁘, 좋아 (2 matches) vs "sad": 슬프 (1 match)
        result = analyze_emotion("기쁘고 좋아하지만 약간 슬프기도 해")
        assert result == "happy"

    def test_mixed_language(self):
        assert analyze_emotion("wow 대박이다!") == "surprised"


class TestSentenceSplitter:
    def test_basic_split(self):
        result = split_sentences("안녕하세요! 반갑습니다. 잘 지내세요?")
        assert len(result) == 3

    def test_single_sentence(self):
        result = split_sentences("안녕하세요")
        assert result == ["안녕하세요"]

    def test_empty_string(self):
        result = split_sentences("")
        assert result == []

    def test_whitespace_only(self):
        result = split_sentences("   ")
        assert result == []

    def test_newline_split(self):
        result = split_sentences("첫 번째 문장\n두 번째 문장")
        assert len(result) == 2

    def test_english_sentences(self):
        result = split_sentences("Hello world! How are you? I'm fine.")
        assert len(result) == 3

    def test_preserves_content(self):
        result = split_sentences("안녕! 반가워!")
        assert result[0] == "안녕!"
        assert result[1] == "반가워!"
