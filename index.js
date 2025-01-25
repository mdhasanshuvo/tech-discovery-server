require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 5000;

app.use(express.json());

app.get('/', (req, res) => {
    res.send('Tech Discovery is running')
})

app.listen(port, () => {
    console.log(`Tech Discovery is running on port : ${port}`)
})