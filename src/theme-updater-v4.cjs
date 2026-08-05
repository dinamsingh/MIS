const fs = require('fs');
const path = require('path');

const filesToUpdate = [
  path.join(__dirname, 'presentation', 'views', 'StudentQuizAccessView.tsx'),
  path.join(__dirname, 'presentation', 'views', 'QuizAttemptView.tsx')
];

const replacements = [
  // 1. Remove solid backgrounds from min-h-screen so the body gradient shows through
  { search: /min-h-screen (flex|font|bg-\[#dde1e7\] dark:bg-\[#0f172a\])/g, replace: (match, p1) => match.replace('bg-[#dde1e7] dark:bg-[#0f172a]', 'bg-transparent') },
  
  // 2. Headers: Convert to glassmorphism
  { search: /bg-\[#dde1e7\] dark:bg-\[#0f172a\] shadow-\[5px_5px_10px_#BABECC,-5px_-5px_10px_#ffffff73\]/g, replace: 'bg-white/40 dark:bg-[#0f172a]/40 backdrop-blur-xl shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] dark:shadow-[0_8px_32px_0_rgba(0,0,0,0.3)]' },
  
  // 3. Cards: Convert rounded-2xl solid blocks to glass
  { search: /bg-\[#dde1e7\] dark:bg-\[#0f172a\] rounded-2xl/g, replace: 'bg-white/40 dark:bg-[#1e293b]/40 backdrop-blur-xl rounded-2xl shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] dark:shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] border border-white/20 dark:border-white/10' },
  
  // 4. Headers in QuizAttemptView: Convert to glass
  { search: /bg-\[#dde1e7\] dark:bg-\[#0f172a\] shadow-sm w-full mx-auto transition-colors duration-500/g, replace: 'bg-white/40 dark:bg-[#0f172a]/60 backdrop-blur-md shadow-[0_4px_30px_rgba(0,0,0,0.1)] border-b border-white/20 dark:border-white/10 w-full mx-auto transition-colors duration-500' },
  
  // 5. Fixed bottom bar in QuizAttemptView: Convert to glass
  { search: /fixed bottom-0 left-0 right-0 bg-\[#dde1e7\] dark:bg-\[#0f172a\]/g, replace: 'fixed bottom-0 left-0 right-0 bg-white/40 dark:bg-[#0f172a]/60 backdrop-blur-xl' },
  
  // 6. Sticky top bar in QuizAttemptView Review: Convert to glass
  { search: /sticky top-0 z-20 bg-\[#dde1e7\] dark:bg-\[#0f172a\] border-b/g, replace: 'sticky top-0 z-20 bg-white/40 dark:bg-[#0f172a]/60 backdrop-blur-xl border-b' },
  
  // 7. Cleanup any duplicate border/shadow classes that got added by #3
  { search: /shadow-\[5px_5px_10px_#BABECC,-5px_-5px_10px_#ffffff73\] dark:shadow-\[5px_5px_10px_#020617,-5px_-5px_10px_#1e293b73\]/g, replace: '' },
  
  // 8. Make sure min-h-screen doesn't still have solid bg if the first regex missed something
  { search: /className="min-h-screen bg-\[#dde1e7\] dark:bg-\[#0f172a\]/g, replace: 'className="min-h-screen bg-transparent' },
  { search: /className="bg-\[#dde1e7\] dark:bg-\[#0f172a\] min-h-screen/g, replace: 'className="bg-transparent min-h-screen' },
];

for (const file of filesToUpdate) {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    for (const rule of replacements) {
      content = content.replace(rule.search, rule.replace);
    }
    fs.writeFileSync(file, content, 'utf8');
    console.log(`Updated ${file}`);
  } else {
    console.error(`File not found: ${file}`);
  }
}
