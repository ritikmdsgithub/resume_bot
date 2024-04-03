import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts"
import { createStuffDocumentsChain } from "langchain/chains/combine_documents"
import { PDFLoader } from 'langchain/document_loaders/fs/pdf'
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter'
import { OpenAIEmbeddings } from '@langchain/openai'
import { MemoryVectorStore } from 'langchain/vectorstores/memory'
import { createRetrievalChain } from 'langchain/chains/retrieval'
import { AIMessage, HumanMessage } from '@langchain/core/messages'
import { MessagesPlaceholder } from '@langchain/core/prompts'
import { createHistoryAwareRetriever } from 'langchain/chains/history_aware_retriever'
import { RedisVectorStore } from '@langchain/redis'
import { createClient } from 'redis';
import JSONCache from 'redis-json';
import Redis from 'ioredis';



import * as dotenv from 'dotenv';

dotenv.config();

const redis = new Redis();
const client = createClient();
await client.connect();

export const isPdfIdPresent = async (pdfId) => {
    const isPdfIdPresent = new RedisVectorStore(new OpenAIEmbeddings(),
        {
            redisClient: client,
            indexName: pdfId,
        }
    )

    return await isPdfIdPresent.checkIndexExists();
}

export const getVectorStoreFromRedis = async (pdfId) => {
    const vectorStoreFromRedis = new RedisVectorStore(new OpenAIEmbeddings(),
        {
            redisClient: client,
            indexName: pdfId,
        }
    )
    const isVectorStorePresent = await vectorStoreFromRedis.checkIndexExists();
    if (isVectorStorePresent) return vectorStoreFromRedis;
}

export const createVectorStore = async (pdfId, filePath) => {

    const pdfLoader = new PDFLoader(filePath);

    const docs = await pdfLoader.load();

    const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 200,
        chunkOverlap: 20
    });

    const splitDocs = await splitter.splitDocuments(docs)

    const embeddings = new OpenAIEmbeddings();

    const vectorStore = await RedisVectorStore.fromDocuments(
        splitDocs,
        embeddings,
        {
            redisClient: client,
            indexName: pdfId,
        }
    );
    return vectorStore;
}


export const createChain = async (vectorStore) => {
    // create model
    const model = new ChatOpenAI({
        modelName: "gpt-3.5-turbo",
        temperature: 0.7
    })

    const prompt = ChatPromptTemplate.fromMessages([
        ["system", "Answer the user's question based on the context: {context}."],
        new MessagesPlaceholder("chat_history"),
        ["user", "{input}"]
    ])

    // create a chain 
    const chain = await createStuffDocumentsChain({
        llm: model,
        prompt: prompt
    })

    // retrieve the data
    const retriever = vectorStore.asRetriever({
        k: 3
    });

    const retrieverPrompt = ChatPromptTemplate.fromMessages([
        new MessagesPlaceholder("chat_history"),
        ["user", "{input}"],
        ["user", "Given the above conversation, generate a search query to look up in order to get information relevant to the conversation"]
    ])

    const historyAwareRetriever = await createHistoryAwareRetriever({
        llm: model,
        retriever: retriever,
        rephrasePrompt: retrieverPrompt
    })

    const conversationChain = await createRetrievalChain({
        combineDocsChain: chain,
        retriever: historyAwareRetriever

    })
    return conversationChain;
}


const chatHistory = [
    new HumanMessage("Hello"),
    new AIMessage("Hi, how can I help you?"),
    new HumanMessage("My Name is Ritik"),
    new AIMessage("Hi Ritik, how can I help you?"),
]

export const isConversationIdPresentInRedis = async (conversationId) => {
    
    const isConversationIdPresent=await client.exists(`jc:${conversationId}`)
    console.log(isConversationIdPresent)
    if (isConversationIdPresent) return conversationId;

}

export const saveConversationInRedis = async (conversationId, data) => {

    const jsonCache = new JSONCache(redis)
    
    await jsonCache.set(conversationId, data)

    // console.log(data)
    // const splitter = new RecursiveCharacterTextSplitter({
    //     chunkSize: 200,
    //     chunkOverlap: 20
    // });

    // const splitDocs = await splitter.splitDocuments(data)

    // const embeddings = new OpenAIEmbeddings();

    // const vectorStore = await RedisVectorStore.fromDocuments(
    //     splitDocs,
    //     embeddings,
    //     {
    //         redisClient: client,
    //         indexName: conversationId,
    //     }
    // );
}


export const getResponse = async (chain, question) => {

    const response = await chain.invoke({
        input: question,
        chat_history: chatHistory
    })

    chatHistory.push(new HumanMessage(question));
    chatHistory.push(new AIMessage(response.answer));
    return { response: response.answer };
}


  
