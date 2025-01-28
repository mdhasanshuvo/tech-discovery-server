require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const app = express();
const port = process.env.PORT || 5000;
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

app.use(cors({
    origin: [
        'http://localhost:5173',
        'https://tech-discovery-auth.web.app',
    ],
    credentials: true
}));

app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.0nnvi.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();
        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");

        const userCollection = client.db("Tech-Discovery-DB").collection("Users");
        const productCollection = client.db('Tech-Discovery-DB').collection('Products');
        const couponCollection = client.db('Tech-Discovery-DB').collection('Coupons');

        // jwt related api
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
            res.send({ token });
        })

        app.get('/products/:id', async (req, res) => {
            const { id } = req.params;

            try {
                const product = await productCollection.findOne({ _id: new ObjectId(id) });

                if (!product) {
                    return res.status(404).send({ message: 'Product not found' });
                }

                res.send({
                    message: 'Product details fetched successfully',
                    product,
                });
            } catch (error) {
                console.error('Error fetching product details:', error);
                res.status(500).send({ message: 'Failed to fetch product details', error });
            }
        });

        app.patch('/products/:id/report', async (req, res) => {
            const { id } = req.params;
            const { userEmail, reportReason } = req.body; // Pass user email and report reason from the frontend

            try {
                const product = await productCollection.findOne({ _id: new ObjectId(id) });

                if (!product) {
                    return res.status(404).send({ message: 'Product not found' });
                }

                const result = await productCollection.updateOne(
                    { _id: new ObjectId(id) },
                    {
                        $push: { reports: { userEmail, reportReason, reportedAt: new Date() } }, // Add report details
                    }
                );

                res.send({ message: 'Product reported successfully', result });
            } catch (error) {
                console.error('Error reporting product:', error);
                res.status(500).send({ message: 'Failed to report product', error });
            }
        });

        // Endpoint to fetch all reported products
        app.get('/reported-products', async (req, res) => {
            try {
                const reportedProducts = await productCollection
                    .find({ reports: { $exists: true, $ne: [] } })
                    .toArray();

                res.send(reportedProducts);
            } catch (error) {
                console.error('Error fetching reported products:', error);
                res.status(500).send({ message: 'Failed to fetch reported products', error });
            }
        });


        app.patch('/products/:id/review', async (req, res) => {
            const { id } = req.params;
            const { reviewerName, reviewerImage, reviewDescription, rating, userEmail } = req.body; // Pass review data from the frontend

            try {
                const product = await productCollection.findOne({ _id: new ObjectId(id) });

                if (!product) {
                    return res.status(404).send({ message: 'Product not found' });
                }

                const result = await productCollection.updateOne(
                    { _id: new ObjectId(id) },
                    {
                        $push: {
                            reviews: { reviewerName, reviewerImage, reviewDescription, rating, userEmail, reviewedAt: new Date() },
                        },
                    }
                );

                res.send({ message: 'Review added successfully', result });
            } catch (error) {
                console.error('Error adding review:', error);
                res.status(500).send({ message: 'Failed to add review', error });
            }
        });



        app.get('/product', async (req, res) => {
            const { page = 1, limit = 6, search = '' } = req.query;

            try {
                const query = {
                    status: 'Accepted',
                    tags: {
                        $elemMatch: {
                            text: { $regex: search, $options: "i" }
                        }
                    }
                };

                const products = await productCollection
                    .find(query)
                    .skip((page - 1) * limit)
                    .limit(parseInt(limit))
                    .toArray();

                const total = await productCollection.countDocuments(query);

                res.send({
                    products,
                    total,
                    totalPages: Math.ceil(total / limit),
                    currentPage: parseInt(page),
                });
            } catch (error) {
                console.error('Error fetching products:', error);
                res.status(500).send({ message: 'Failed to fetch products', error });
            }
        });

        app.patch('/products/:id/upvote', async (req, res) => {
            const { id } = req.params;
            const { userEmail } = req.body; // Pass user email from the frontend

            try {
                const product = await productCollection.findOne({ _id: new ObjectId(id) });

                if (!product) {
                    return res.status(404).send({ message: 'Product not found' });
                }

                if (product.voters?.includes(userEmail)) {
                    return res.status(400).send({ message: 'User has already voted for this product' });
                }

                const result = await productCollection.updateOne(
                    { _id: new ObjectId(id) },
                    {
                        $inc: { votes: 1 },
                        $push: { voters: userEmail }, // Maintain a list of users who voted
                    }
                );

                res.send({ message: 'Upvoted successfully', result });
            } catch (error) {
                console.error('Error upvoting product:', error);
                res.status(500).send({ message: 'Failed to upvote product', error });
            }
        });


        app.patch('/products/:id/downvote', async (req, res) => {
            const { id } = req.params;
            const { userEmail } = req.body; // Pass user email from the frontend

            try {
                const product = await productCollection.findOne({ _id: new ObjectId(id) });

                if (!product) {
                    return res.status(404).send({ message: 'Product not found' });
                }

                if (!product.voters?.includes(userEmail)) {
                    return res.status(400).send({ message: 'User has not voted for this product yet' });
                }

                const result = await productCollection.updateOne(
                    { _id: new ObjectId(id) },
                    {
                        $inc: { votes: -1 },
                        $pull: { voters: userEmail }, // Remove the user email from the voters list
                    }
                );

                res.send({ message: 'Downvoted successfully', result });
            } catch (error) {
                console.error('Error downvoting product:', error);
                res.status(500).send({ message: 'Failed to downvote product', error });
            }
        });






        app.get('/queue-products/review-queue', async (req, res) => {
            try {
                const products = await productCollection
                    .find()
                    .sort({ status: 1 })
                    .toArray();
                res.send(products);
            } catch (error) {
                console.error("Error fetching products for review queue:", error);
                res.status(500).send({ message: "Failed to fetch products" });
            }
        });

        app.patch('/products/:id/status', async (req, res) => {
            const { id } = req.params;
            const { status } = req.body;

            if (!['Accepted', 'Rejected'].includes(status)) {
                return res.status(400).send({ message: "Invalid status value" });
            }

            try {
                const result = await productCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { status } }
                );

                if (result.modifiedCount === 0) {
                    return res.status(404).send({ message: "Product not found or status unchanged" });
                }

                res.send({ message: "Product status updated successfully" });
            } catch (error) {
                console.error("Error updating product status:", error);
                res.status(500).send({ message: "Failed to update product status", error });
            }
        });

        app.patch('/products/:id/featured', async (req, res) => {
            const { id } = req.params;

            try {
                const result = await productCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { featured: true } }
                );

                if (result.modifiedCount === 0) {
                    return res.status(404).send({ message: "Product not found or already featured" });
                }

                res.send({ message: "Product marked as featured successfully" });
            } catch (error) {
                console.error("Error marking product as featured:", error);
                res.status(500).send({ message: "Failed to mark product as featured", error });
            }
        });


        // Update a product by ID
        app.put('/products/:id', async (req, res) => {
            const id = req.params.id;
            const updatedProduct = req.body;
            delete updatedProduct._id;

            try {
                const result = await productCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: updatedProduct }
                );

                if (result.modifiedCount === 0) {
                    return res.status(404).send({ message: "Product not found or no changes made" });
                }

                res.send({ message: "Product updated successfully" });
            } catch (error) {
                res.status(500).send({ message: "Failed to update product", error });
            }
        });

        // Fetch all products by user email
        app.get('/products', async (req, res) => {
            const email = req.query.email;
            if (!email) {
                return res.status(400).send({ message: "User email is required" });
            }
            try {
                const products = await productCollection.find({ "owner.email": email }).toArray();
                res.send(products);
            } catch (error) {
                res.status(500).send({ message: "Failed to fetch products", error });
            }
        });

        // Delete a product by ID
        app.delete('/products/:id', async (req, res) => {
            const id = req.params.id;
            try {
                const result = await productCollection.deleteOne({ _id: new ObjectId(id) });
                if (result.deletedCount === 0) {
                    return res.status(404).send({ message: "Product not found" });
                }
                res.send({ message: "Product deleted successfully" });
            } catch (error) {
                res.status(500).send({ message: "Failed to delete product", error });
            }
        });

        app.post('/products', async (req, res) => {
            const { name, image, description, tags, externalLink, owner } = req.body;
            const ownerName = owner.name
            const ownerEmail = owner.email;
            const ownerImage = owner.image;

            // Check if all required fields are provided
            if (!name || !image || !description || !ownerEmail) {
                return res.status(400).send({ message: 'All fields are required' });
            }

            try {
                // Find the user in the database
                const user = await userCollection.find({ email: ownerEmail }).toArray();

                if (user.length === 0) {
                    return res.status(404).send({ message: 'User not found' });
                }

                // Check if the user is eligible to add a product
                const userProductsCount = await productCollection.countDocuments({ "owner.email": ownerEmail });

                if (!user[0].subscribed && userProductsCount >= 1) {
                    return res.status(403).send({
                        message: 'Product limit reached. Purchase a membership subscription to add more products.',
                    });
                }

                // Create the product object
                const product = {
                    name,
                    image,
                    description,
                    tags,
                    externalLink,
                    owner: {
                        name: ownerName,
                        email: ownerEmail,
                        image: ownerImage,
                    },
                    createdAt: new Date(), // Save the timestamp for sorting
                };

                // Insert the product into the database
                const result = await productCollection.insertOne(product);

                res.status(201).send({
                    message: 'Product added successfully',
                    productId: result.insertedId,
                });
            } catch (error) {
                console.error('Error adding product:', error);
                res.status(500).send({ message: 'Failed to add product', error });
            }
        });



        app.get('/user/eligibility', async (req, res) => {
            const { email } = req.query;

            if (!email) {
                return res.status(400).send({ message: "Email is required" });
            }

            try {
                // Check if the user exists and fetch their subscription status
                const userCursor = userCollection.find({ email }).limit(1);
                const userList = await userCursor.toArray();

                if (userList.length === 0) {
                    return res.status(404).send({ message: "User not found" });
                }

                const user = userList[0]; // Extract user from the array

                // Count the number of products added by the user
                const userProductsCount = await productCollection.countDocuments({ "owner.email": email });

                // Determine eligibility
                const canAddProduct = user.subscribed || userProductsCount < 1;

                res.send({ canAddProduct });
            } catch (error) {
                console.error("Error checking eligibility:", error);
                res.status(500).send({ message: "Failed to check eligibility", error });
            }
        });









        app.get("/users", async (req, res) => {
            try {
                const users = await userCollection.find().toArray();
                res.send(users);
            } catch (error) {
                res.status(500).send({ message: "Failed to fetch users", error });
            }
        });

        app.get('/users/admin/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            let admin = false;
            if (user) {
                admin = user?.role === 'admin';
            }
            res.send({ admin });
        })

        app.get('/users/moderator/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email };

            try {
                const user = await userCollection.findOne(query);
                let moderator = false;

                if (user) {
                    moderator = user?.role === 'moderator';
                }

                res.send({ moderator });
            } catch (error) {
                console.error("Error checking moderator status:", error);
                res.status(500).send({ error: "Internal Server Error" });
            }
        });


        app.get("/user/profile", async (req, res) => {
            const email = req.query.email; // Get email from query parameter
            if (!email) {
                return res.status(400).send({ message: "Email is required" }); // Handle missing email
            }

            try {
                const user = await userCollection.findOne({ email });
                if (!user) {
                    return res.status(404).send({ message: "User not found" });
                }
                res.send(user); // Send the user profile
            } catch (error) {
                res.status(500).send({ message: "Error fetching user profile", error });
            }
        });


        app.patch("/user/subscribe", async (req, res) => {
            const email = req.body.email; // Assuming email is passed in the body
            try {
                const result = await userCollection.updateOne(
                    { email },
                    { $set: { subscribed: true } }
                );

                if (result.matchedCount === 0) {
                    return res.status(404).send({ message: "User not found" });
                }
                res.send({ message: "Subscription updated successfully" });
            } catch (error) {
                res.status(500).send({ message: "Error updating subscription", error });
            }
        });


        app.get('/user/subscription', async (req, res) => {
            const { email } = req.query;
            try {
                if (!email) {
                    return res.status(400).send({ message: 'Email is required' });
                }

                const user = await userCollection.findOne({ email });

                if (!user) {
                    return res.status(404).send({ message: 'User not found' });
                }

                res.send({ subscribed: user.subscribed || false });
            } catch (error) {
                console.error('Error fetching subscription status:', error);
                res.status(500).send({ message: 'Failed to fetch subscription status', error });
            }
        });





        // Endpoint to update user role
        app.patch("/users/:id/role", async (req, res) => {
            const { id } = req.params;
            const { role } = req.body;

            try {
                const result = await userCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { role } }
                );

                if (result.matchedCount === 0) {
                    return res.status(404).send({ message: "User not found" });
                }

                res.send({ message: "Role updated successfully", result });
            } catch (error) {
                res.status(500).send({ message: "Failed to update role", error });
            }
        });

        app.post("/users", async (req, res) => {
            const user = req.body;
            const query = { email: user.email };
            const existingUser = await userCollection.findOne(query);
            if (existingUser) {
                return res.send({ message: "user already exists", insertedId: null });
            }
            const result = await userCollection.insertOne(user);
            res.send(result);
        });


        // Endpoint to fetch trending products
        app.get('/tproducts/trending', async (req, res) => {
            try {
                const trendingProducts = await productCollection
                    .find({ status: 'Accepted' }) // Only fetch accepted products
                    .sort({ votes: -1 }) // Sort by votes (highest first)
                    .limit(6) // Limit to 6 products
                    .toArray();

                if (!trendingProducts) {
                    return res.status(404).send({ message: 'No products found' });
                }

                res.send(trendingProducts);
            } catch (error) {
                console.error('Error fetching trending products:', error);
                res.status(500).send({ message: 'Failed to fetch trending products', error });
            }
        });

        app.get('/f-products/featured', async (req, res) => {
            try {
                const featuredProducts = await productCollection
                    .find({ status: 'Accepted', featured: true }) // Fetch only featured products
                    .sort({ createdAt: -1 }) // Sort by timestamp (latest first)
                    .limit(4) // Limit to 4 products
                    .toArray();

                if (!featuredProducts || featuredProducts.length === 0) {
                    return res.status(404).send({ message: 'No featured products found' });
                }

                res.send(featuredProducts);
            } catch (error) {
                console.error('Error fetching featured products:', error);
                res.status(500).send({ message: 'Failed to fetch featured products', error });
            }
        });



        // payment intent
        app.post('/create-payment-intent', async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100);
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });
            res.send({
                clientSecret: paymentIntent.client_secret
            })
        })


        app.get('/admin/statistics', async (req, res) => {
            try {
                const products = await productCollection.find().toArray();
                const reviews = await productCollection.aggregate([{ $unwind: "$reviews" }]).toArray();
                const users = await userCollection.countDocuments();

                const acceptedProducts = products.filter(product => product.status === 'Accepted').length;
                const pendingProducts = products.filter(product => product.status === 'Pending').length;

                res.send({
                    products: products.length,
                    acceptedProducts,
                    pendingProducts,
                    reviews: reviews.length,
                    users,
                });
            } catch (error) {
                console.error('Error fetching statistics:', error);
                res.status(500).send({ message: 'Failed to fetch statistics', error });
            }
        });


        // coupons api
        app.post('/coupons', async (req, res) => {
            const { code, expiryDate, description, discount } = req.body;

            try {
                const newCoupon = {
                    code,
                    expiryDate: new Date(expiryDate),
                    description,
                    discount: parseFloat(discount),
                };

                const result = await couponCollection.insertOne(newCoupon);
                res.send({ message: 'Coupon added successfully', result });
            } catch (error) {
                console.error('Error adding coupon:', error);
                res.status(500).send({ message: 'Failed to add coupon', error });
            }
        });


        app.get('/coupons', async (req, res) => {
            try {
                const coupons = await couponCollection.find({}).toArray();
                res.send(coupons);
            } catch (error) {
                console.error('Error fetching coupons:', error);
                res.status(500).send({ message: 'Failed to fetch coupons', error });
            }
        });

        app.patch('/coupons/:id', async (req, res) => {
            const { id } = req.params;
            const { code, expiryDate, description, discount } = req.body;

            try {
                const result = await couponCollection.updateOne(
                    { _id: new ObjectId(id) },
                    {
                        $set: {
                            code,
                            expiryDate: new Date(expiryDate),
                            description,
                            discount: parseFloat(discount),
                        },
                    }
                );
                res.send({ message: 'Coupon updated successfully', result });
            } catch (error) {
                console.error('Error updating coupon:', error);
                res.status(500).send({ message: 'Failed to update coupon', error });
            }
        });


        app.delete('/coupons/:id', async (req, res) => {
            const { id } = req.params;

            try {
                const result = await couponCollection.deleteOne({ _id: new ObjectId(id) });
                res.send({ message: 'Coupon deleted successfully', result });
            } catch (error) {
                console.error('Error deleting coupon:', error);
                res.status(500).send({ message: 'Failed to delete coupon', error });
            }
        });


        app.get("/valid", async (req, res) => {
            try {
                const currentDate = new Date();
                const validCoupons = await couponCollection.find({
                    expiryDate: { $gte: currentDate },
                }).toArray();
                res.json(validCoupons);
            } catch (error) {
                res.status(500).json({ message: "Failed to fetch valid coupons", error });
            }
        });


        // Validate Coupon Code API
        app.get("/coupons/validate", async (req, res) => {
            try {
                const { code } = req.query;

                if (!code) {
                    return res.status(400).json({
                        success: false,
                        message: "Coupon code is required.",
                    });
                }

                // Fetch coupon from the database
                const coupon = await couponCollection.findOne({ code });

                if (!coupon) {
                    return res.status(404).json({
                        success: false,
                        message: "Coupon code is invalid.",
                    });
                }

                // Check if the coupon is expired
                const currentDate = new Date();
                if (new Date(coupon.expiryDate) < currentDate) {
                    return res.status(400).json({
                        success: false,
                        message: "Coupon code is expired.",
                    });
                }

                // Return coupon details if valid
                return res.status(200).json({
                    success: true,
                    code: coupon.code,
                    discount: coupon.discount,
                    expiryDate: coupon.expiryDate,
                    message: "Coupon is valid.",
                });
            } catch (error) {
                console.error("Error validating coupon:", error);
                return res.status(500).json({
                    success: false,
                    message: "An error occurred while validating the coupon.",
                });
            }
        });







    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Tech Discovery is running')
})

app.listen(port, () => {
    console.log(`Tech Discovery is running on port : ${port}`)
})