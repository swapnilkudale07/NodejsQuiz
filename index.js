const express = require('express')
const app = express()
const Joi = require('joi');
const {
   MongoMemoryServer
} = require('mongodb-memory-server');
const {
   MongoClient,
   ObjectId
} = require('mongodb');
let MONGO_CONN = false;
app.use(express.json());

let dbConn = {}

//In Memory mondodb server creation and prequisite collections.

let mongoConnection = async () => {
   const mongod = await MongoMemoryServer.create();
   const mongoUri = mongod.getUri();
   console.log("Mongo connection successful")
   process.env.MONGO_CONNECTION = true;
   const devServer = await MongoClient.connect(mongoUri, {
      useNewUrlParser: true
   });
   let db = devServer.db("QuizDB");
   await db.createCollection("Quiz");
   await db.createCollection("Question:");
   await db.createCollection("Answer");
   await db.createCollection("Result");
   MONGO_CONN = true;
   dbConn = db;
   return db
}
mongoConnection();


// API to create new Quiz

app.post("/createQuiz", async (req, res) => {
  try{
   const {
      body
   } = req;

   // API request payload validation check
   let quizSchema = Joi.object().keys({
      title: Joi.string().required().trim(),
      questions: Joi.array().items({
         text: Joi.string().required().trim(),
         options: Joi.object().keys({
            "a": Joi.string().required().trim(),
            "b": Joi.string().required().trim(),
            "c": Joi.string().required().trim(),
            "d": Joi.string().required().trim(),
         }).required(),
         correct_option: Joi.string().required().valid("a", "b", "c", "d").trim(),

      }).required()
   }).required();

   const {
      error,
      value
   } = quizSchema.validate(body);
   if (error) {
      return res.status(400).json({
         error: `${error.details[0].message}`
      });
   } else {

    let quizExist = await dbConn.collection("Quiz").find({title : body.title}).toArray();

      if(quizExist.length > 0){
        return res.status(409).send({
          message: 'Quiz Already Exist'
        })
      }

      let questions = [];
      body.questions.map((question) => {
         questions.push({
            question: question.text
         });
      })
      let quizDetails = {};
      quizDetails.title = body.title;
      quizDetails.questions = questions;

      let quizResult = await dbConn.collection("Quiz").insertOne(quizDetails);

      body.questions.map((question) => {
         question.quizId = quizResult.insertedId;
      });
      await dbConn.collection("Question").insertMany(body.questions);

      return res.status(201).send({
         message: 'Quiz created Successfully',
         quizId: quizResult.insertedId
      })
   }
  }catch(Error){
    return res.status(500).send({
      message: `Error Occured: ${Error.message}`
       })
  }
});

// API to fetch quiz by quizid

app.get("/fetchQuiz", async (req, res) => {
  try{
   const {
    quizId
   } = req.query;
   let quizSchema = Joi.object().keys({
    quizId: Joi.string().required().trim(),
   }).required();

   const {
      error,
      value
   } = quizSchema.validate(req.query);
   if (error) {
      return res.status(400).json({
         error: `${error.details[0].message}`
      });
   } else {
      let result = await dbConn.collection("Question")
         .find({
            quizId: new ObjectId(quizId)
         })
         .project({
            _id: 0,
            text: 1,
            options: 1,
            questionId: "$_id"
         })
         .toArray();

      if (!result.length) return res.status(404).send({
         message: 'Quiz Not Found',
         data: result
      })
      return res.status(200).send({
         message: 'Data fetched successfully',
         data: result
      });
   }
  }catch(Error){
    return res.status(500).send({
      message: `Error Occured: ${Error.message}`
    })
  }
})

//API to submit quiz answers

app.post("/submitAnswer", async (req, res) => {
  try{
   const {
      questionid,
      option,
      userId
   } = req.body;
   let quizSchema = Joi.object().keys({
      questionid: Joi.string().required().trim(),
      option: Joi.string().required().valid("a", "b", "c", "d").trim(),
      userId: Joi.number().required(),
   }).required();

   const {
      error,
      value
   } = quizSchema.validate(req.body);
   if (error) {
      return res.status(400).json({
         error: `${error.details[0].message}`
      });
   } else {
      let answerResult = await dbConn.collection("Question")
         .find({
            _id: new ObjectId(questionid)
         })
         .project({
            _id: 1,
            text: 1,
            correct_option: 1,
            quizId: 1
         })
         .toArray();
      if (!answerResult.length) return res.status(404).send({
         message: 'Question not found'
      });
      let {
         correct_option,
         quizId
      } = answerResult[0];
      let result = {
         questionid: new ObjectId(questionid),
         selected_option: option,
         userId: userId
      }

      let isCorrect = correct_option == option ? true : false;
      let message = isCorrect ? `Your answer is Correct` : `Your answer is Incorrect, The correct answer is: ${correct_option}`;
      result.is_correct = true;

      let answers = {
         question: answerResult[0].text,
         userAnser: option,
         result: isCorrect ? "Correct" : "InCorrect"
      };

      let updateResult = await dbConn.collection('Result').updateOne({
            "user_id": userId,
            quiz_id: quizId
         }, {
            $inc: {
               score: isCorrect ? 1 : 0
            },
            $push: {
               answers: answers
            }
         }, {
            upsert: true
         }
      );
      await dbConn.collection("Answer").insertOne(result);
      return res.status(200).send({
         message: message
      });
   }
  }catch(Error){
    return res.status(500).send({
      message: `Error Occured: ${Error.message}`
    })
  }
})

//API to fetch users quiz result

app.get("/fetchResult", async (req, res) => {
  try{
   const {
      userid,
      quizId
   } = req.query;
   let quizSchema = Joi.object().keys({
      userid: Joi.number().required(),
      quizId: Joi.string().required().trim(),
   }).required();

   const {
      error,
      value
   } = quizSchema.validate(req.query);
   if (error) {
      return res.status(400).json({
         error: `${error.details[0].message}`
      });
   } else {
      let result = await dbConn.collection("Result")
         .find({
            user_id: parseInt(userid),
            quiz_id: new ObjectId(quizId)
         })
         .project({
            _id: 0,
            user_id: 1,
            quiz_id: 1,
            score: 1,
            answers: 1
         })
         .toArray();
      if (!result.length) return res.status(404).send({
         message: 'User Result Not Found',
         data: result
      })
      return res.status(200).send({
         message: 'Data fetched successfully',
         data: result
      });
   }
  }catch(Error){
    return res.status(500).send({
      message: `Error Occured: ${Error.message}`
    })
  }
})


app.listen(3000, (error) => {
   console.log(`Server listening on: http://localhost:3000 `)
});

