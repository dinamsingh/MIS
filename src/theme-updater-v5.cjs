const fs = require('fs');
const path = require('path');

const filesToUpdate = [
  path.join(__dirname, 'presentation', 'views', 'QuizAttemptView.tsx'),
  path.join(__dirname, 'presentation', 'views', 'StudentQuizAccessView.tsx')
];

for (const file of filesToUpdate) {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    
    // Replace all solid base colors with Glassmorphic bases
    content = content.replace(/bg-\[#dde1e7\] dark:bg-\[#0f172a\]/g, 'bg-white/40 dark:bg-[#0f172a]/60 backdrop-blur-xl');
    
    // Some places had `dark:bg-[#1e293b]` instead, replace those too if they matched earlier
    content = content.replace(/bg-\[#dde1e7\] dark:bg-\[#1e293b\]/g, 'bg-white/40 dark:bg-[#1e293b]/60 backdrop-blur-xl');

    // Also remove the old shadow classes from the header if they clash with glass
    // Actually, neumorphic shadows on glass look cool.
    
    fs.writeFileSync(file, content, 'utf8');
    console.log(`Updated ${file}`);
  }
}
