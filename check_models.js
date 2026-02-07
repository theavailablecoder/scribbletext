
import { GoogleGenAI } from "@google/genai";

const apiKey = "AIzaSyAnQ4X0fvroL0Cq5IwuOiPB-5Sjyvv0CbY"; // Key 1

async function checkModels() {
  try {
    const ai = new GoogleGenAI({ apiKey });
    console.log("Checking available models...");
    
    // In the new SDK, it might be different. Let's try to list.
    // Documentation says: ai.models.list()
    
    const response = await ai.models.list();
    
    console.log("Success! Models found:");
    if (response) {
       // The response format depends on SDK version
       if (Array.isArray(response)) {
          response.forEach(m => console.log(` - ${m.name}`));
       } else if (response.models) {
          response.models.forEach(m => console.log(` - ${m.name}`));
       } else {
          console.log(response);
       }
    }
  } catch (error) {
    console.error("Error listing models:", error);
  }
}

checkModels();
