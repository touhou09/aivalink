EMOTION_KEYWORDS: dict[str, list[str]] = {
    "happy": ["기쁘", "좋아", "행복", "즐거", "웃", "하하", "ㅎㅎ", "재미", "happy", "glad", "joy", "great", "love", "awesome"],
    "sad": ["슬프", "우울", "안타깝", "힘들", "눈물", "ㅠㅠ", "sad", "sorry", "cry", "miss", "lonely"],
    "angry": ["화나", "짜증", "분노", "싫어", "열받", "angry", "hate", "furious", "annoying"],
    "surprised": ["놀라", "대박", "헐", "진짜?", "와!", "세상에", "wow", "amazing", "unbelievable", "omg"],
}


def analyze_emotion(text: str) -> str:
    """Analyze text and return the dominant emotion based on keyword matching.
    Returns one of: happy, sad, angry, surprised, neutral
    """
    text_lower = text.lower()
    scores: dict[str, int] = {}
    for emotion, keywords in EMOTION_KEYWORDS.items():
        count = sum(1 for kw in keywords if kw in text_lower)
        if count > 0:
            scores[emotion] = count

    if not scores:
        return "neutral"
    return max(scores, key=scores.get)
