const express = require('express');
const { GoogleGenAI } = require("@google/genai");
const path = require('path');

// --- Configuration ---
// IMPORTANT: The API key is read securely from the GCP environment variable.
const API_KEY = process.env.GEMINI_API_KEY;
const MODEL_NAME = "gemini-2.5-flash-image-preview";

// Initialize the Gemini client
let ai;
if (API_KEY) {
    // Note: The client initialization should occur only if the key is present
    ai = new GoogleGenAI({ apiKey: API_KEY });
}

const app = express();
// Allows large JSON bodies (up to 10MB) for image data
app.use(express.json({ limit: '10mb' })); 

// --- Proxy Endpoint Handler ---
async function handleProxyRequest(req, res) {
    if (!ai) {
        console.error("Gemini client is not initialized. API key missing.");
        return res.status(500).json({ error: 'Server initialization error: API key not configured securely on Google Cloud.' });
    }

    try {
        const { prompt, imageData, mimeType } = req.body;

        if (!prompt || !imageData || !mimeType) {
            return res.status(400).json({ error: 'Missing prompt, image data, or mime type in request body.' });
        }

        // Construct Gemini API Payload
        const geminiPayload = {
            model: MODEL_NAME,
            contents: [
                {
                    role: "user",
                    parts: [
                        { text: prompt },
                        {
                            inlineData: {
                                mimeType: mimeType,
                                data: imageData
                            }
                        }
                    ]
                }
            ],
            generationConfig: {
                responseModalities: ['IMAGE']
            },
        };

        // Call the Gemini API
        const response = await ai.models.generateContent(geminiPayload);

        const candidate = response.candidates?.[0];
        const base64Data = candidate?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;

        if (!base64Data) {
            const blockReason = candidate?.finishReason || "UNKNOWN";
            if (blockReason === "SAFETY") {
                return res.status(403).json({ error: "The spell was rejected by the Guardian of the Nexus (Safety Filter)." });
            }
            return res.status(500).json({ error: "The Transmutation failed to yield a visual artifact." });
        }

        // Send the generated image back to the frontend
        res.status(200).json({ base64Data });

    } catch (error) {
        console.error("Gemini API Call Error:", error);
        res.status(500).json({ error: 'Internal Alchemy Engine Failure. Check server logs.' });
    }
}

// --- Express Routing ---
// 1. Route the proxy request from the client app
app.post('/api/proxy', handleProxyRequest);

// 2. Serve static files (index.html, etc.) from the root directory
app.use(express.static(path.join(__dirname, '')));

// 3. Start the Server
// App Engine requires listening on the port specified by the environment variable
const PORT = process.env.PORT || 8080; 
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});