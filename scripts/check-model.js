import sharp from "sharp";
import { complete } from "../server/model.js";
import { config } from "../server/config.js";
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="260"><rect width="600" height="260" fill="white"/><text x="40" y="80" font-family="Arial" font-size="32">Math worksheet</text><text x="40" y="150" font-family="Arial" font-size="38">1) 24 + 18 = 42</text><text x="40" y="210" font-family="Arial" font-size="38">2) 7 x 8 = 54</text></svg>';
const image = await sharp(Buffer.from(svg)).jpeg().toBuffer();
const start = Date.now();
try {
  const result = await complete(
    [
      {
        role: "system",
        content:
          'Read the worksheet image. Return only JSON: {"answers":[{"number":1,"studentAnswer":"42","correctAnswer":"42","verdict":"correct"}]}. Include both problems. verdict must be exactly correct or wrong.',
      },
      {
        role: "user",
        content: [
          { type: "text", text: "Grade the two problems." },
          {
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${image.toString("base64")}`,
            },
          },
        ],
      },
    ],
    { maxTokens: 1000 },
  );
  console.log(
    JSON.stringify(
      {
        model: config.model,
        seconds: Math.round((Date.now() - start) / 100) / 10,
        result,
      },
      null,
      2,
    ),
  );
  if (
    result.answers?.length !== 2 ||
    result.answers[0].verdict !== "correct" ||
    result.answers[1].verdict !== "wrong" ||
    String(result.answers[1].correctAnswer) !== "56"
  )
    process.exitCode = 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
