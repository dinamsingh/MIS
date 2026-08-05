const fs = require('fs');
const path = require('path');

const filesToUpdate = [
  path.join(__dirname, 'presentation', 'views', 'StudentQuizAccessView.tsx'),
  path.join(__dirname, 'presentation', 'views', 'QuizAttemptView.tsx')
];

const replacements = [
  // Base backgrounds -> Neumorphic base
  { search: /bg-\[#f8f9ff\]/g, replace: 'bg-[#dde1e7]' },
  
  // Card backgrounds -> Match neumorphic base
  { search: /bg-\[#ffffff\]/g, replace: 'bg-[#dde1e7]' },
  
  // Dark mode Card Backgrounds -> Match neumorphic dark base
  { search: /dark:bg-\[#1e293b\]/g, replace: 'dark:bg-[#0f172a]' },
  
  // Dark mode Body Backgrounds -> Match neumorphic dark base
  { search: /dark:bg-\[#020617\]/g, replace: 'dark:bg-[#0f172a]' },
  
  // Replace simple shadows with Neumorphic Drop Shadows
  { search: /shadow-ambient/g, replace: 'shadow-[5px_5px_10px_#BABECC,-5px_-5px_10px_#ffffff73] dark:shadow-[5px_5px_10px_#020617,-5px_-5px_10px_#1e293b73]' },
  { search: /shadow-\[0px_4px_20px_rgba\(46,49,146,0\.05\)\]/g, replace: 'shadow-[5px_5px_10px_#BABECC,-5px_-5px_10px_#ffffff73] dark:shadow-[5px_5px_10px_#020617,-5px_-5px_10px_#1e293b73]' },
  { search: /shadow-sm/g, replace: 'shadow-[2px_2px_5px_#BABECC,-2px_-2px_5px_#ffffff73] dark:shadow-[2px_2px_5px_#020617,-2px_-2px_5px_#1e293b73]' },
  { search: /shadow-md/g, replace: 'shadow-[4px_4px_8px_#BABECC,-4px_-4px_8px_#ffffff73] dark:shadow-[4px_4px_8px_#020617,-4px_-4px_8px_#1e293b73]' },
  { search: /hover:shadow-lg/g, replace: 'hover:shadow-[inset_2px_2px_5px_#BABECC,inset_-2px_-2px_5px_#ffffff73] dark:hover:shadow-[inset_2px_2px_5px_#020617,inset_-2px_-2px_5px_#1e293b73]' },
  
  // Update borders to blend with Neumorphism or add glass effect
  { search: /border-\[#c7c5d4\]/g, replace: 'border-white/20' },
  { search: /dark:border-\[#334155\]\/30/g, replace: 'dark:border-white/10' },
  { search: /border-\[#e6eeff\]/g, replace: 'border-white/20' },
  
  // Inputs (need inset shadows)
  { search: /bg-\[#f0f4ff\]/g, replace: 'bg-[#dde1e7] shadow-[inset_2px_2px_5px_#BABECC,inset_-2px_-2px_5px_#ffffff73]' },
  { search: /dark:bg-\[#312e81\]/g, replace: 'dark:bg-[#0f172a] dark:shadow-[inset_2px_2px_5px_#020617,inset_-2px_-2px_5px_#1e293b73]' },
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
