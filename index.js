require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const cron = require('node-cron');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;
const MONGODB_URI = process.env.MONGODB_URI;

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('Connected to MongoDB'))
.catch((err) => console.error('Error connecting to MongoDB:', err));

const transactionSchema = new mongoose.Schema({
  address: String,
  transactions: Array,
});

const ethPriceSchema = new mongoose.Schema({
  price: Number,
  timestamp: { type: Date, default: Date.now }
});

const Transaction = mongoose.model('Transaction', transactionSchema);
const EthPrice = mongoose.model('EthPrice', ethPriceSchema);

app.post('/api/transactions', async (req, res) => {
  const { address } = req.body;
  try {
    const response = await axios.get(`https://api.etherscan.io/api?module=account&action=txlist&address=${address}&sort=asc&apikey=${ETHERSCAN_API_KEY}`);
    const transactions = response.data.result;

    const newTransaction = new Transaction({ address, transactions });
    await newTransaction.save();

    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

cron.schedule('*/10 * * * *', async () => {
  try {
    const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=inr');
    const ethPrice = response.data.ethereum.inr;

    const newPrice = new EthPrice({ price: ethPrice });
    await newPrice.save();

    console.log(`Ethereum price fetched and saved: ${ethPrice} INR`);
  } catch (error) {
    console.error('Error fetching Ethereum price:', error);
  }
});

app.get('/api/expenses', async (req, res) => {
  const { address } = req.query;
  try {
    const transactions = await Transaction.findOne({ address });
    const latestPrice = await EthPrice.findOne().sort({ timestamp: -1 });

    if (!transactions) {
      return res.status(404).json({ error: 'Address not found' });
    }

    let totalExpense = 0;
    transactions.transactions.forEach(tx => {
      totalExpense += (parseInt(tx.gasUsed) * parseInt(tx.gasPrice)) / 1e18;
    });

    res.json({ totalExpense, currentPrice: latestPrice.price });
  } catch (error) {
    res.status(500).json({ error: 'Failed to calculate expenses' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
