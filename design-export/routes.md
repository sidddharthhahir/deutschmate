# DeutschMate routes

## Pages
/                       Home — the one button
/session                Session runner (renders 11 block types)
/wortschatz             Browse all 1,225 words
/fortschritt            Progress
/ueben                  Free practice + scenario list
/wort/[id]              Word detail
/grammatik/[slug]       Grammar reference (36 points)
/szenario/[id]          Replay any roleplay
/admin/video            Video segment editor (not learner-facing)

## Session block types rendered inside /session
review · fix · new-vocab · new-grammar · listening · reading
video · builder · conversation · writing · speaking · quiz

## API
/api/session   /api/review   /api/attempt   /api/quiz
/api/chat      /api/writing  /api/wortschatz  /api/word  /api/video
