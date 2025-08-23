const imageUpload = document.getElementById("imageUpload");
const resultsDiv = document.getElementById("results");
const finalText = document.getElementById("finalText");
const copyBtn = document.getElementById("copyBtn");
const themeToggle = document.getElementById("themeToggle");

let extractedData = [];

function analyzeColor(color) {
  if (color.includes("green")) return "ميداني";
  if (color.includes("purple")) return "تحذير";
  if (color.includes("red")) return "خارج الخدمة";
  return "غير معروف";
}

async function extractTextFromImage(file) {
  const { data: { text } } = await Tesseract.recognize(file, "ara");
  const lines = text.split("\n").filter(l => l.trim());
  extractedData = lines.map(line => ({
    text: line,
    status: "ميداني" // حالياً افتراضي
  }));
  displayResults();
}

function displayResults() {
  resultsDiv.innerHTML = "";
  let finalOutput = "📑 النتيجة النهائية:\n\n";

  extractedData.forEach(item => {
    resultsDiv.innerHTML += `<p>${item.text} - <b>${item.status}</b></p>`;
    finalOutput += `- ${item.text} : ${item.status}\n`;
  });

  finalText.value = finalOutput;
}

copyBtn.addEventListener("click", () => {
  finalText.select();
  document.execCommand("copy");
  alert("✅ تم نسخ النتيجة!");
});

themeToggle.addEventListener("click", () => {
  document.body.classList.toggle("dark");
  themeToggle.textContent =
    document.body.classList.contains("dark") ? "☀️" : "🌙";
});

imageUpload.addEventListener("change", e => {
  const file = e.target.files[0];
  if (file) extractTextFromImage(file);
});