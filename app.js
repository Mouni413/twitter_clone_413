const express = require("express");
const app = express();
app.use(express.json());
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;

const initializeDbServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server is running on the port 3000");
    });
  } catch (e) {
    console.log(`Db Error:${e.message}`);
  }
};

initializeDbServer();

// post user

app.post("/register/", async (request, response) => {
  const { username, name, password, gender } = request.body;
  const isUserPresentQuery = `
    select * from user where username='${username}';
    `;
  const isUserPresent = await db.get(isUserPresentQuery);
  if (isUserPresent !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const userPostQuery = `
      insert into user (username,name,password,gender)
      values
      ('${username}','${name}','${hashedPassword}','${gender}');
      `;
      await db.run(userPostQuery);
      response.status(200);
      response.send("User created successfully");
    }
  }
});

// authenticationToken midleware

const authenticationToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "Mounika", async (error, payLoad) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payLoad.username;
        next();
      }
    });
  }
};

// get /user/tweets/feed/
const ans = (eachItem) => {
  return {
    username: eachItem.username,
    tweet: eachItem.tweet,
    dateTime: eachItem.date_time,
  };
};

app.get(
  "/user/tweets/feed/",
  authenticationToken,
  async (request, response) => {
    const username = request.username;
    const getUserId = `
    select * from user where username="${username}";
    `;
    const userId = await db.get(getUserId);
    const getUserTweetsQuery = `
    select 
    tweet.tweet_id,
    tweet.user_id,
    user.username,
    tweet.tweet,
    tweet.date_time 
    from 
    follower
    left join tweet on follower.following_user_id ==tweet.user_id 
    left join user on user.user_id==follower.following_user_id 
    where follower.follower_user_id=${userId.user_id}
    order by tweet.date_time desc 
    limit 4;
    `;
    const getUserTweets = await db.all(getUserTweetsQuery);
    response.send(getUserTweets.map((eachItem) => ans(eachItem)));
  }
);

// select distinct user.name as name from user inner join follower on user.user_id=follower.follower_user_id;

// get /user/following/

app.get("/user/following/", authenticationToken, async (request, response) => {
  const username = request.username;
  const getUserId = `
    select * from user where username="${username}";
    `;
  const userId = await db.get(getUserId);
  const getUserFollowingQuery = `
    select user.name as name 
    from 
    user inner join follower on user.user_id=follower.following_user_id 
    where 
    follower.follower_user_id=${userId.user_id};
    `;
  const getUserFollowing = await db.all(getUserFollowingQuery);
  response.send(getUserFollowing);
});

// get /user/followers/

app.get("/user/followers/", authenticationToken, async (request, response) => {
  const username = request.username;
  const getUserId = `
    select * from user where username="${username}";
    `;
  const userId = await db.get(getUserId);
  const getUserFollowerQuery = `
    select user.name as name 
    from 
    user inner join follower on user.user_id=follower.follower_user_id 
    where 
    follower.following_user_id=${userId.user_id};
    `;
  const getUserFollower = await db.all(getUserFollowerQuery);
  response.send(getUserFollower);
});

// get tweets/:tweetId

const follows = async (request, response, next) => {
  const { tweetId } = request.params;
  const isFollowingQuery = `
    select * from follower
    where
    follower_user_id=(select user_id from user where username='${request.username}')
    and following_user_id=(select user_id from tweet where tweet_id=${tweetId});
    `;
  const isFollowing = await db.get(isFollowingQuery);
  if (isFollowing === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    next();
  }
};

app.get(
  "/tweets/:tweetId/",
  authenticationToken,
  follows,
  async (request, response) => {
    const { tweetId } = request.params;
    const { tweet, date_time } = await db.get(`
    select tweet,date_time from tweet where tweet_id=${tweetId};
    `);
    const { replies } = await db.get(`
    select count(reply_id) as replies from reply where tweet_id=${tweetId};
    `);
    const { likes } = await db.get(`
    select count(like_id) as likes from like where tweet_id=${tweetId};
    `);
    response.send({ tweet, likes, replies, dateTime: date_time });
  }
);

// get /tweets/:tweetId/likes/

app.get(
  "/tweets/:tweetId/likes/",
  authenticationToken,
  follows,
  async (request, response) => {
    const { tweetId } = request.params;
    const likesQuery = `
    select user.username from user natural join like where like.tweet_id=${tweetId};
    `;
    const likes = await db.all(likesQuery);
    response.send({ likes: likes.map((eachItem) => eachItem.username) });
  }
);

// get /tweets/:tweetId/replies/

app.get(
  "/tweets/:tweetId/replies/",
  authenticationToken,
  follows,
  async (request, response) => {
    const { tweetId } = request.params;
    const repliesQuery = `
    select 
    user.name as name,
    reply.reply as reply 
    from 
    reply natural join user 
    where 
    reply.tweet_id=${tweetId};
    `;
    const replyDate = await db.all(repliesQuery);
    response.send({ replies: replyDate });
  }
);

// get /user/tweets/

app.get("/user/tweets/", authenticationToken, async (request, response) => {
  const username = request.username;
  const getUserId = `
    select * from user where username="${username}";
    `;
  const userId = await db.get(getUserId);
  const getUserTweetsQuery = `
    select tweet.tweet as tweet,
    count(distinct like.like_id) as likes,
    count(distinct reply.reply_id) as replies,
    tweet.date_time as dateTime 
    from 
    tweet left join like on tweet.tweet_id==like.tweet_id 
    left join reply on tweet.tweet_id==reply.tweet_id 
    where tweet.user_id=${userId.user_id}
    group by tweet.tweet_id;
    `;
  const getUserTweets = await db.all(getUserTweetsQuery);
  response.send(getUserTweets);
});

// get /user/tweets/

app.post("/user/tweets/", authenticationToken, async (request, response) => {
  const { tweet } = request.body;
  const username = request.username;
  const getUserId = `
    select * from user where username="${username}";
    `;
  const userId = await db.get(getUserId);
  const postTweetQuery = `
    insert into tweet (tweet,user_id)
    values
    ("${tweet}",${userId.user_id});
    `;
  await db.run(postTweetQuery);
  response.send("Created a Tweet");
});

// delete tweet
app.delete(
  "/tweets/:tweetId/",
  authenticationToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const username = request.username;
    const getUserId = `
    select * from user where username="${username}";
    `;
    const userId = await db.get(getUserId);
    const isTweetQuery = `
    select 
    tweet_id,
    user_id 
    from 
    tweet 
    where 
    tweet_id=${tweetId}
    and user_id=${userId.user_id};
    `;
    const isTweet = await db.get(isTweetQuery);
    if (isTweet === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      await db.run(`
      delete from tweet where tweet_id=${tweetId}
      `);
      response.send("Tweet Removed");
    }
  }
);

// login user

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const isUserRegisteredQuery = `
    select * from user where username='${username}';
    `;
  const isUserRegistered = await db.get(isUserRegisteredQuery);
  if (isUserRegistered === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isValidPassword = await bcrypt.compare(
      password,
      isUserRegistered.password
    );
    if (isValidPassword) {
      const payLoad = {
        username: username,
      };
      const jwtToken = await jwt.sign(payLoad, "Mounika");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

module.exports = app;
