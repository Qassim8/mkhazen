// scripts/bundle-feature.mjs
import fs from "fs";
import path from "path";

// جلب اسم الفيتشر من الأوامر
const feature = process.argv[2];

if (!feature) {
  console.error(
    "❌ يرجى تحديد اسم الفيتشر. مثال:\n   node scripts/bundle-feature.mjs accounting",
  );
  process.exit(1);
}

const featureLower = feature.toLowerCase();
const outputFile = `bundle-${featureLower}.txt`;

// المجلدات الرئيسية المعتادة للبحث
const searchDirs = ["src", "app", "lib", "types", "services"];
const matchedFiles = [];

// دالة فحص المجلدات واستخراج الملفات ذات الصلة
function scanDir(dir) {
  if (!fs.existsSync(dir)) return;

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // تجنب المجلدات غير المرغوبة
      if (["node_modules", ".next", ".git"].includes(entry.name)) continue;
      scanDir(fullPath);
    } else if (entry.isFile()) {
      const normalizedPath = fullPath.replace(/\\/g, "/").toLowerCase();

      // مطابقة الملفات التي تتبع الفيتشر المحددة
      const isMatch =
        normalizedPath.includes(`/${featureLower}/`) ||
        normalizedPath.includes(`/${featureLower}.`) ||
        normalizedPath.includes(`-${featureLower}.`) ||
        normalizedPath.includes(`${featureLower}-`);

      if (isMatch) {
        matchedFiles.push(fullPath);
      }
    }
  }
}

// البدء في مسح المجلدات
searchDirs.forEach((d) => scanDir(d));

if (matchedFiles.length === 0) {
  console.log(`⚠️ لم يتم العثور على أي ملفات مرتبطة بالفيتشر: "${feature}"`);
  process.exit(0);
}

// دمج محتوى الملفات
let bundleContent = `==================================================\n`;
bundleContent += `📦 FEATURE BUNDLE: ${feature.toUpperCase()}\n`;
bundleContent += `📅 Date: ${new Date().toLocaleString()}\n`;
bundleContent += `📁 Total Files: ${matchedFiles.length}\n`;
bundleContent += `==================================================\n\n`;

for (const filePath of matchedFiles) {
  const relativePath = path
    .relative(process.cwd(), filePath)
    .replace(/\\/g, "/");
  const fileContent = fs.readFileSync(filePath, "utf-8");

  bundleContent += `/**************************************************\n`;
  bundleContent += ` * FILE: ${relativePath}\n`;
  bundleContent += ` **************************************************/\n\n`;
  bundleContent += fileContent.trim() + `\n\n`;
}

// كتابة النتيجة في الملف النهائي
fs.writeFileSync(outputFile, bundleContent, "utf-8");

console.log(`✅ تم دمج ${matchedFiles.length} ملف بنجاح!`);
console.log(`📄 الملف الناتج: ${outputFile}`);
