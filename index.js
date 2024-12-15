import express from 'express';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import DOMPurify from 'isomorphic-dompurify';
import Groq from "groq-sdk";
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

// const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const groq = new Groq({ apiKey: "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" });
const AIRFORCE_BASE_URL = 'https://api.airforce';

const app = express();
const port = 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(bodyParser.json());
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

async function generateImagePrompts(topic) {
  const imageModels = [
    'flux-realism',
    'flux-4o'
  ];

  const validSizes = ['16:9', '21:9'];

  const imagePrompts = await Promise.all(imageModels.slice(0, 2).map(async (model) => {
    const size = validSizes[Math.floor(Math.random() * validSizes.length)];
    const seed = Math.floor(Math.random() * 9000000) + 1000000;

    try {
      const response = await axios.get(`${AIRFORCE_BASE_URL}/v1/imagine`, {
        params: {
          prompt: `Detailed visual representation of ${topic}, professional high-resolution, contextually rich imagery`,
          size: size,
          seed: seed,
          model: model
        },
        responseType: 'arraybuffer'
      });

      return {
        model: model,
        size: size,
        seed: seed,
        imageBuffer: response.data
      };
    } catch (error) {
      console.error(`Image generation error for model ${model}:`, error.message);
      return null;
    }
  }));
  return imagePrompts.filter(prompt => prompt !== null);
}

app.post('/search', async (req, res) => {
  const { query } = req.body;

  if (!query || query.trim() === '') {
    return res.status(400).json({ result: 'No query provided.' });
  }

  try {
    const imagePrompts = await generateImagePrompts(query);

    const systemPrompt = `
You are Qalam, an Intelligent model fine-tuned by a computer science student Ayush Singh for a project, you may know more about Ayush from https://github.com/ayushsingh-ayushsingh, you are created and fine-tuned specifically to generate detailed, professional, and engaging articles for a variety of audiences. Your primary goal is to produce content that is accurate, comprehensive, and easy to understand while maintaining a professional tone. You must adhere to the following detailed guidelines to ensure that your output meets the highest standards.

You are an advanced AI content generator. Follow these strict guidelines:

1. Content Structure:
   - Always generate a complete, valid HTML document
   - Use semantic HTML5 tags
   - Wrap entire content in <article> tag
   - Use proper heading hierarchy (h1, h2, h3)
   - Ensure well-formed HTML syntax

2. Styling Requirements:
   - Use Tailwind CSS classes for styling
   - Ensure responsive design
   - Create clean, professional layout

3. Content Guidelines:
   - Write comprehensive, engaging content
   - Maximum 5000 words
   - Include at least 2 contextually relevant images
   - Use no other source for image other than api.airforce
   i.e. <img src="https://api.airforce/v1/imagine?prompt={prompt}&size=21:9&seed=2341203792&model=flux-realism" alt="Alt text goes here">
   - Use diverse content types: paragraphs, lists, tables

4. Image Integration:
   - Generate two distinct images related to the topic
   - Use descriptive alt text
   - Apply responsive image classes

Example Structure:
    <article>
        <h1 class="text-3xl font-bold mb-4">Topic Title</h1>
        
        <section class="mb-6">
            <h2 class="text-2xl font-semibold mb-3">Section Title</h2>
            <p class="text-base mb-4">Paragraph content...</p>
            
            <img 
                src="image-url" 
                alt="Image description" 
                class="w-full h-auto rounded-lg mb-4"
            />

            <img
                src="https://api.airforce/v1/imagine?prompt={prompt}&size=16:9&seed=2341203792&model=flux-realism"
                alt="Alt text goes here"
                class="w-full h-auto rounded-lg mb-4"
            />

        </section>
        
        <!-- More sections as needed -->
    </article>

Output Instructions:
- Absolutely NO code blocks or fragments
- Complete, valid HTML document
- No unescaped special characters
- Proper HTML entity encoding
`;

    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: `Generate a comprehensive, visually rich very detailed HTML article about: ${query}. 
          Ensure the content is very detailed, includes images, and uses Tailwind CSS for styling. 
          Create sections that explore different aspects of the topic with engaging headings and subheadings.`
        }
      ],
      model: "llama-3.1-8b-instant",
      max_tokens: 8000,
      temperature: 0.7
    });

    const aiResponse = completion.choices[0].message.content;

    const htmlWithImages = aiResponse.replace(
      '<article',
      `<article data-image-count="${imagePrompts.length}"`
    );

    const imageInsertedHTML = imagePrompts.reduce((html, imagePrompt, index) => {
      const base64Image = Buffer.from(imagePrompt.imageBuffer).toString('base64');
      const imageTag = `
        <img 
          src="data:image/png;base64,${base64Image}" 
          alt="Generated image of ${query} (${imagePrompt.model})" 
          class="w-full h-auto rounded-lg mb-4 object-cover"
          data-model="${imagePrompt.model}"
          data-size="${imagePrompt.size}"
          data-seed="${imagePrompt.seed}"
        />
      `;

      return html.replace(
        '</article>',
        `${imageTag}</article>`
      );
    }, htmlWithImages);

    const sanitizedHTML = DOMPurify.sanitize(imageInsertedHTML, {
      ALLOWED_TAGS: [
        'h1', 'h2', 'h3', 'h4', 'p', 'ul', 'ol', 'li',
        'strong', 'em', 'a', 'div', 'span', 'br', 'img',
        'table', 'thead', 'tbody', 'tr', 'th', 'td',
        'section', 'article', 'header', 'footer'
      ],
      ALLOWED_ATTR: [
        'href', 'target', 'class', 'src', 'alt',
        'width', 'height', 'style',
        'data-model', 'data-size', 'data-seed'
      ]
    });

    res.json({ result: sanitizedHTML });
  } catch (error) {
    console.error('AI Generation Error:', error);
    res.status(500).json({
      result: `<div class="bg-red-100 p-4 rounded-lg text-red-800">
        <h2 class="text-xl font-bold mb-2">Error Generating Response</h2>
        <p>Unable to generate AI response. Please try again later.</p>
        <details class="mt-2 text-sm">
          <summary>Technical Details</summary>
          <pre>${JSON.stringify(error, null, 2)}</pre>
        </details>
      </div>`
    });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});