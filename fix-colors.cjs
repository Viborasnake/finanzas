const fs = require('fs');
const execSync = require('child_process').execSync;

function replaceInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;
  
  content = content.replace(/'#f8fafc'/g, "'var(--surface-subtle)'");
  content = content.replace(/"#f8fafc"/g, '"var(--surface-subtle)"');
  content = content.replace(/#f8fafc/g, "var(--surface-subtle)");
  
  content = content.replace(/'#fdfdfc'/g, "'var(--bg-color)'");
  content = content.replace(/"#fdfdfc"/g, '"var(--bg-color)"');
  content = content.replace(/#fdfdfc/g, "var(--bg-color)");
  
  content = content.replace(/'#fff'/g, "'var(--surface-color)'");
  content = content.replace(/"#fff"/g, '"var(--surface-color)"');
  
  content = content.replace(/'#000'/g, "'var(--border-color)'");
  content = content.replace(/"#000"/g, '"var(--border-color)"');
  
  content = content.replace(/'#fefce8'/g, "'var(--account-card-unconfigured)'");
  content = content.replace(/'#f0fdf4'/g, "'var(--account-card-paid)'");
  
  content = content.replace(/rgba\(0,0,0,0\.7\)/g, "var(--text-secondary)");
  content = content.replace(/rgba\(0,0,0,0\.5\)/g, "var(--text-muted)");
  content = content.replace(/'rgba\(0,0,0,0.7\)'/g, "'var(--text-secondary)'");
  content = content.replace(/'rgba\(0,0,0,0.5\)'/g, "'var(--text-muted)'");
  
  if (content !== original) {
    fs.writeFileSync(filePath, content);
    console.log('Updated', filePath);
  }
}

const files = execSync('find src -type f -name "*.tsx" -o -name "*.css"').toString().split('\n').filter(Boolean);
files.forEach(replaceInFile);
