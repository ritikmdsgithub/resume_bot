import express from 'express';
import {
    getResponse, createChain, createVectorStore,
     isPdfIdPresent, getVectorStoreFromRedis, 
} from './llm.js'
import bodyParser from 'body-parser'
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer'
import { Chain } from './chains.js';

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.json());
app.use(bodyParser.urlencoded({ extended: false }))

const PORT = process.env.PORT || 4000;

const newChain = new Chain();

// upload a pdf
app.post('/api/upload-pdf', upload.single('pdf'), async (req, res) => {
    const pdfId = uuidv4();
    try {
        const file = req.file;
        if (!file) {
            throw new Error('No file uploaded');
        }
        const filePath = file.path;

        await createVectorStore(pdfId, filePath);

        res.status(300).json({ pdfId: pdfId, message: 'File Uploaded Successfully' });
        console.log("File Uploaded Successfully")
    } catch (error) {
        console.error('Error uploading PDF:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


// create vector store 
// app.post('/api/create-chain/:pdfId', async (req, res) => {
//     try {
//         const { pdfId } = req.params;

//         const ispdfIdPresent = await isPdfIdPresent(pdfId)

//         if (ispdfIdPresent) {
//             const vectorStore = await getVectorStoreFromRedis(pdfId);
//             if (vectorStore) {
//                 const chain = await createChain(vectorStore);
//                 newChain.setChain(chain);
//                 res.json({ pdfId: pdfId, status: "Now Start The Conversation" });
//                 console.log({ pdfId: pdfId, status: "Now Start The Conversation" })
//             }
//         } else {
//             res.json({ pdfId: pdfId, status: "This pdfId is not present" });
//             console.log({ pdfId: pdfId, status: "This pdfId is not present" })
//         }
//     } catch (error) {
//         console.error('Error starting conversation:', error);
//         res.status(500).json({ error: 'This pdfId is not present in redis please upload again.' });
//     }
// });


app.post('/api/chat/:pdfId', async (req, res) => {
    try {
        const { pdfId } = req.params;
        const ispdfIdPresent = await isPdfIdPresent(pdfId)

        const conversationId = pdfId;
        const { question } = req.body;

        if (ispdfIdPresent) {
            const vectorStore = await getVectorStoreFromRedis(pdfId);
            if (vectorStore) {
                const chain = await createChain(vectorStore);
                const response = await getResponse(chain, question, pdfId);
                console.log({ conversationId, response })
                res.send({ conversationId, response });
            }
        } else {
            res.json({ pdfId: pdfId, status: "This pdfId is not exist" });
            console.log({ pdfId: pdfId, status: "This pdfId is not exist" })
        }

        if (!question) {
            throw new Error('Question is missing in the request body');
        }
        
    } catch (error) {
        console.error('Error processing request:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
})

// conversation with conversationId
// app.post('/api/chat/:conversationId', async (req, res) => {
//     try {
//         const { conversationId } = req.params;
//         const { question } = req.body;

//         if (!question) {
//             throw new Error('Question is missing in the request body');
//         }

//         const conversationContext = await isConversationIdPresentInRedis(conversationId);
//         if (!conversationContext) {
//             throw new Error('Conversation ID is invalid');
//         }
//         const chain = newChain.getChain();
//         const response = await getResponse(chain, question);
//         await saveConversationInRedis(conversationId, { question: question, response: response.response })

//         console.log({ conversationId, response })
//         res.send({ conversationId, response });
//     } catch (error) {
//         console.error('Error processing request:', error);
//         res.status(500).json({ error: 'Internal server error' });
//     }
// });


app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});


