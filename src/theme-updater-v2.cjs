const fs = require('fs');
const path = require('path');

const filesToUpdate = [
  path.join(__dirname, 'presentation', 'views', 'StudentQuizAccessView.tsx'),
  path.join(__dirname, 'presentation', 'views', 'QuizAttemptView.tsx')
];

const replacements = [
  // Backgrounds
  { search: /bg-\[#dde1e7\]/g, replace: 'bg-[#dde1e7] dark:bg-[#0f172a]' },
  { search: /bg-\[#ffffff\]/g, replace: 'bg-[#ffffff] dark:bg-[#1e293b]' },
  { search: /bg-\[#f8f9ff\]/g, replace: 'bg-[#f8f9ff] dark:bg-[#020617]' },
  { search: /bg-\[#d5e3fc\]/g, replace: 'bg-[#d5e3fc] dark:bg-[#1e1b4b]' },
  { search: /bg-\[#eff4ff\]/g, replace: 'bg-[#eff4ff] dark:bg-[#312e81]' },
  { search: /bg-\[#f0f4ff\]/g, replace: 'bg-[#f0f4ff] dark:bg-[#312e81]' },
  { search: /bg-\[#e6eeff\]/g, replace: 'bg-[#e6eeff] dark:bg-[#3730a3]' },
  
  // Accents
  { search: /bg-\[#15157d\]/g, replace: 'bg-[#15157d] dark:bg-[#818cf8]' },
  { search: /bg-\[#0c0092\]/g, replace: 'bg-[#0c0092] dark:bg-[#6366f1]' },
  
  // Text colors
  { search: /text-\[#595959\]/g, replace: 'text-[#595959] dark:text-[#f8fafc]' },
  { search: /text-\[#464652\]/g, replace: 'text-[#464652] dark:text-[#cbd5e1]' },
  { search: /text-\[#666666\]/g, replace: 'text-[#666666] dark:text-[#cbd5e1]' },
  { search: /text-\[#777683\]/g, replace: 'text-[#777683] dark:text-[#94a3b8]' },
  { search: /text-\[#0d1c2e\]/g, replace: 'text-[#0d1c2e] dark:text-[#ffffff]' },
  { search: /text-\[#2d3748\]/g, replace: 'text-[#2d3748] dark:text-[#f1f5f9]' },
  { search: /text-\[#a19fad\]/g, replace: 'text-[#a19fad] dark:text-[#64748b]' },
  { search: /text-\[#15157d\]/g, replace: 'text-[#15157d] dark:text-[#818cf8]' },
  { search: /text-\[#0c0092\]/g, replace: 'text-[#0c0092] dark:text-[#6366f1]' },
  { search: /text-\[#00b894\]/g, replace: 'text-[#00b894] dark:text-[#34d399]' },
  
  // Hover Text
  { search: /hover:text-\[#15157d\]/g, replace: 'hover:text-[#15157d] dark:hover:text-[#818cf8]' },
  { search: /hover:text-\[#0c0092\]/g, replace: 'hover:text-[#0c0092] dark:hover:text-[#6366f1]' },
  { search: /hover:text-\[#0d1c2e\]/g, replace: 'hover:text-[#0d1c2e] dark:hover:text-[#ffffff]' },
  
  // Focus Text
  { search: /focus:text-\[#3498db\]/g, replace: 'focus:text-[#3498db] dark:focus:text-[#60a5fa]' },
  { search: /focus:text-\[#15157d\]/g, replace: 'focus:text-[#15157d] dark:focus:text-[#818cf8]' },

  // Borders
  { search: /border-\[#c7c5d4\]/g, replace: 'border-[#c7c5d4] dark:border-[#334155]' },
  { search: /border-\[#15157d\]/g, replace: 'border-[#15157d] dark:border-[#818cf8]' },
  
  // Shadows
  // Drop shadows
  { search: /shadow-\[2px_2px_5px_#BABECC,-5px_-5px_10px_#ffffff73\]/g, replace: 'shadow-[2px_2px_5px_#BABECC,-5px_-5px_10px_#ffffff73] dark:shadow-[2px_2px_5px_#020617,-5px_-5px_10px_#1e293b73]' },
  { search: /shadow-\[-3px_-3px_7px_#ffffff73,2px_2px_5px_rgba\(94,104,121,0\.288\)\]/g, replace: 'shadow-[-3px_-3px_7px_#ffffff73,2px_2px_5px_rgba(94,104,121,0.288)] dark:shadow-[-3px_-3px_7px_#1e293b73,2px_2px_5px_rgba(0,0,0,0.5)]' },
  { search: /shadow-\[5px_5px_10px_#BABECC,-5px_-5px_10px_#ffffff73\]/g, replace: 'shadow-[5px_5px_10px_#BABECC,-5px_-5px_10px_#ffffff73] dark:shadow-[5px_5px_10px_#020617,-5px_-5px_10px_#1e293b73]' },
  { search: /shadow-\[6px_6px_12px_#BABECC,-6px_-6px_12px_#ffffff73\]/g, replace: 'shadow-[6px_6px_12px_#BABECC,-6px_-6px_12px_#ffffff73] dark:shadow-[6px_6px_12px_#020617,-6px_-6px_12px_#1e293b73]' },
  { search: /shadow-\[10px_10px_20px_#BABECC,-10px_-10px_20px_#ffffff73\]/g, replace: 'shadow-[10px_10px_20px_#BABECC,-10px_-10px_20px_#ffffff73] dark:shadow-[10px_10px_20px_#020617,-10px_-10px_20px_#1e293b73]' },
  { search: /shadow-\[4px_4px_8px_#BABECC,-4px_-4px_8px_#ffffff73\]/g, replace: 'shadow-[4px_4px_8px_#BABECC,-4px_-4px_8px_#ffffff73] dark:shadow-[4px_4px_8px_#020617,-4px_-4px_8px_#1e293b73]' },
  { search: /shadow-\[8px_8px_16px_#BABECC,-8px_-8px_16px_#ffffff73\]/g, replace: 'shadow-[8px_8px_16px_#BABECC,-8px_-8px_16px_#ffffff73] dark:shadow-[8px_8px_16px_#020617,-8px_-8px_16px_#1e293b73]' },
  
  // Hover Shadows
  { search: /hover:shadow-\[1px_1px_3px_#BABECC,-3px_-3px_6px_#ffffff73\]/g, replace: 'hover:shadow-[1px_1px_3px_#BABECC,-3px_-3px_6px_#ffffff73] dark:hover:shadow-[1px_1px_3px_#020617,-3px_-3px_6px_#1e293b73]' },
  { search: /hover:shadow-\[3px_3px_6px_#BABECC,-3px_-3px_6px_#ffffff73\]/g, replace: 'hover:shadow-[3px_3px_6px_#BABECC,-3px_-3px_6px_#ffffff73] dark:hover:shadow-[3px_3px_6px_#020617,-3px_-3px_6px_#1e293b73]' },
  { search: /hover:shadow-\[2px_2px_4px_#BABECC,-2px_-2px_4px_#ffffff73\]/g, replace: 'hover:shadow-[2px_2px_4px_#BABECC,-2px_-2px_4px_#ffffff73] dark:hover:shadow-[2px_2px_4px_#020617,-2px_-2px_4px_#1e293b73]' },
  
  // Inset Shadows
  { search: /shadow-\[inset_2px_2px_5px_#BABECC,inset_-5px_-5px_10px_#ffffff73\]/g, replace: 'shadow-[inset_2px_2px_5px_#BABECC,inset_-5px_-5px_10px_#ffffff73] dark:shadow-[inset_2px_2px_5px_#020617,inset_-5px_-5px_10px_#1e293b73]' },
  { search: /shadow-\[inset_2px_2px_5px_#BABECC,inset_-2px_-2px_5px_#ffffff73\]/g, replace: 'shadow-[inset_2px_2px_5px_#BABECC,inset_-2px_-2px_5px_#ffffff73] dark:shadow-[inset_2px_2px_5px_#020617,inset_-2px_-2px_5px_#1e293b73]' },
  { search: /shadow-\[inset_3px_3px_6px_#BABECC,inset_-3px_-3px_6px_#ffffff73\]/g, replace: 'shadow-[inset_3px_3px_6px_#BABECC,inset_-3px_-3px_6px_#ffffff73] dark:shadow-[inset_3px_3px_6px_#020617,inset_-3px_-3px_6px_#1e293b73]' },
  { search: /shadow-\[inset_4px_4px_8px_#BABECC,inset_-4px_-4px_8px_#ffffff73\]/g, replace: 'shadow-[inset_4px_4px_8px_#BABECC,inset_-4px_-4px_8px_#ffffff73] dark:shadow-[inset_4px_4px_8px_#020617,inset_-4px_-4px_8px_#1e293b73]' },
  { search: /shadow-\[inset_1px_1px_2px_#BABECC,inset_-1px_-1px_2px_#ffffff73\]/g, replace: 'shadow-[inset_1px_1px_2px_#BABECC,inset_-1px_-1px_2px_#ffffff73] dark:shadow-[inset_1px_1px_2px_#020617,inset_-1px_-1px_2px_#1e293b73]' },
  { search: /focus:shadow-\[inset_2px_2px_5px_#BABECC,inset_-5px_-5px_10px_#ffffff73\]/g, replace: 'focus:shadow-[inset_2px_2px_5px_#BABECC,inset_-5px_-5px_10px_#ffffff73] dark:focus:shadow-[inset_2px_2px_5px_#020617,inset_-5px_-5px_10px_#1e293b73]' },
  { search: /focus:shadow-\[inset_1px_1px_2px_#BABECC,inset_-1px_-1px_2px_#ffffff73\]/g, replace: 'focus:shadow-[inset_1px_1px_2px_#BABECC,inset_-1px_-1px_2px_#ffffff73] dark:focus:shadow-[inset_1px_1px_2px_#020617,inset_-1px_-1px_2px_#1e293b73]' },
  { search: /active:shadow-\[inset_2px_2px_5px_#BABECC,inset_-2px_-2px_5px_#ffffff73\]/g, replace: 'active:shadow-[inset_2px_2px_5px_#BABECC,inset_-2px_-2px_5px_#ffffff73] dark:active:shadow-[inset_2px_2px_5px_#020617,inset_-2px_-2px_5px_#1e293b73]' },
  { search: /active:shadow-\[inset_2px_2px_4px_#BABECC,inset_-2px_-2px_4px_#ffffff73\]/g, replace: 'active:shadow-[inset_2px_2px_4px_#BABECC,inset_-2px_-2px_4px_#ffffff73] dark:active:shadow-[inset_2px_2px_4px_#020617,inset_-2px_-2px_4px_#1e293b73]' }
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
