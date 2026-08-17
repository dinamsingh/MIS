const fs = require('fs');

function revertGlassmorphism(filePath) {
  let code = fs.readFileSync(filePath, 'utf8');
  
  // Revert outer card glassmorphism
  code = code.replace(/className="bg-white\/60 dark:bg-\[#0f172a\]\/40 backdrop-blur-2xl rounded-\[32px\] p-6 md:p-8 shadow-\[0_20px_40px_-15px_rgba\(0,0,0,0\.05\),0_0_0_1px_rgba\(255,255,255,0\.4\)_inset\] dark:shadow-\[0_20px_40px_-15px_rgba\(0,0,0,0\.5\),0_0_0_1px_rgba\(255,255,255,0\.1\)_inset\] border border-white\/20 dark:border-white\/5([^"]*)"/g, 'className="bg-surface p-8 rounded-[32px] shadow-card border border-border$1"');

  // Remove inner glow
  code = code.replace(/<div className="absolute top-0 left-0 right-0 h-\[1px\] bg-gradient-to-r from-transparent via-white\/60 dark:via-white\/20 to-transparent"><\/div>/g, '');

  // Revert inner card glassmorphism (QuizAccessView inner sections)
  code = code.replace(/className="bg-white\/40 dark:bg-\[#0f172a\]\/60 backdrop-blur-xl p-8 rounded-2xl  border border-white\/20([^"]*)"/g, 'className="bg-surface p-8 rounded-2xl shadow-card border border-border$1"');
  code = code.replace(/className="mt-6 rounded-xl border border-white\/20 dark:border-\[#334155\] bg-white\/40 dark:bg-\[#0f172a\]\/60 backdrop-blur-xl px-6 py-4 w-full"/g, 'className="mt-6 rounded-xl border border-border bg-surface-muted px-6 py-4 w-full"');
  code = code.replace(/className="rounded-xl border border-white\/20 dark:border-\[#334155\] bg-white\/40 dark:bg-\[#0f172a\]\/60 backdrop-blur-xl p-5 text-left"/g, 'className="rounded-xl border border-border bg-surface-muted p-5 text-left"');

  // Fix Teacher SignIn inputs premium placeholders
  code = code.replace(/placeholder="Enter your college email"/g, 'placeholder="e.g. name@university.edu"');
  code = code.replace(/placeholder="Enter 6-digit code"/g, 'placeholder="0 0 0 0 0 0"');
  code = code.replace(/placeholder="New Password"/g, 'placeholder="••••••••"');

  // Fix Double background: outer div shouldn't be #f8fafc. It should just use background from theme (or bg-background)
  code = code.replace(/bg-\[#f8fafc\] dark:bg-background/g, 'bg-background');

  // Fix header glassmorphism
  code = code.replace(/className="bg-white\/40 dark:bg-\[#0f172a\]\/40 backdrop-blur-xl shadow-\[0_8px_32px_0_rgba\(31,38,135,0\.07\)\] dark:shadow-\[0_8px_32px_0_rgba\(0,0,0,0\.3\)\] dark:shadow-\[5px_5px_10px_#020617,-5px_-5px_10px_#1e293b73\] w-full top-0 z-50 sticky transition-all duration-300"/g, 'className="bg-surface/80 backdrop-blur-xl border-b border-border w-full top-0 z-50 sticky transition-all duration-300"');

  fs.writeFileSync(filePath, code);
}

revertGlassmorphism('src/presentation/views/StudentQuizAccessView.tsx');
revertGlassmorphism('src/presentation/views/TeacherSignInView.tsx');
console.log('UI Updated');
