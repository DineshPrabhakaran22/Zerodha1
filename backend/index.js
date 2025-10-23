require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");

const { HoldingsModel } = require("./models/HoldingsModel");
const { PositionsModel } = require("./models/PositionsModel");
const { OrdersModel } = require("./models/OrdersModel");
const AuthRoute = require("./AuthRoute");

const port = process.env.PORT || 3001;
const uri = process.env.MONGODB_URI;

const app = express();

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "https://zerodha1dashboard.vercel.app",
  "https://zerodha1frontend.vercel.app",
  
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true); // allow curl, Postman, etc.
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      } else {
        return callback(new Error("CORS not allowed for this origin"), false);
      }
    },
    credentials: true,
  })
);

app.use(cookieParser());
app.use(bodyParser.json());
app.use(express.json());

app.get("/allHoldings", async (req, res) => {
  let allHoldings = await HoldingsModel.find({});
  res.send(allHoldings);
});
app.get("/allPositions", async (req, res) => {
  let allPositions = await PositionsModel.find({});
  res.send(allPositions);
});

app.post("/newOrder", async (req, res) => {
  const { name, qty, price, mode } = req.body;

  try {
    // 1. Save or update order
    await OrdersModel.findOneAndUpdate(
      { name, mode },
      {
        $inc: { qty: qty },
        $set: { price: price },
      },
      { upsert: true, new: true }
    );

    // 2. Get existing holding
    const existing = await HoldingsModel.findOne({ name });

    if (mode === "BUY") {
      if (existing) {
        // update avg price and qty
        const totalQty = existing.qty + qty;
        const newAvg = (existing.qty * existing.avg + qty * price) / totalQty;

        existing.qty = totalQty;
        existing.avg = newAvg;
        existing.price = price; // latest price
        await existing.save();
      } else {
        // create new holding
        await HoldingsModel.create({
          name,
          qty,
          avg: price,
          price,
          net: "+0%",
          day: "+0%",
        });
      }
    }

    if (mode === "SELL") {
      if (!existing || existing.qty < qty) {
        return res.status(400).send("Not enough stock to sell");
      }

      existing.qty -= qty;

      if (existing.qty === 0) {
        await HoldingsModel.deleteOne({ name });
      } else {
        await existing.save();
      }
    }

    res.send("Order and Holdings updated successfully!");
  } catch (err) {
    console.error("Order update error:", err);
    res.status(500).send("Server error");
  }
});

app.get("/allOrders", async (req, res) => {
  let allOrders = await OrdersModel.find({});
  res.send(allOrders);
});

// user signup signin route
app.use("/", AuthRoute);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);

  mongoose
    .connect(uri)
    .then(() => console.log("Connected to MongoDB!"))
    .catch((err) => console.error("MongoDB connection error:", err));
});
