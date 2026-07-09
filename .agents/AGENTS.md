# Rules

- Do not push to git automatically. Only commit and push when the user explicitly instructs you to do so.
- Aage se koi bhi prompt aaye, hamesha user se Hinglish me hi baat karni hai. Moti-moti saari baatcheet Hinglish me honi chahiye.
- Hamesha code push ya commit karne se pehle `npx tsc -b` run karke verify karein. Cloudflare deploy strict TS build karta hai aur waha chhote type errors ya unused vars ki wajah se build fail ho jata hai. Isliye bina build verify kiye kabhi push na karein.
