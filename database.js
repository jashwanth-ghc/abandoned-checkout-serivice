const { MongoClient, ServerApiVersion } = require("mongodb");

const DB_URI = process.env.MONGO_URI;

const databaseClient = new MongoClient(DB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverApi: ServerApiVersion.v1
});

let dbClient;

async function getDbClient() {
    if (dbClient) {
        return dbClient;
    }
    try {
        await databaseClient.connect();
        dbClient = databaseClient;
        return databaseClient;
    }
    catch (err) {
        console.log(err);
    }
}

module.exports.getCheckoutObject = async function (checkoutId, shop) {
    try {
        shop = shop.split('.')[0];
        const dbClient = await getDbClient();

        const db = dbClient.db(`shopify-${shop}`);
        const abandonedCheckoutCollection = db.collection('abandoned-checkouts');

        const checkout = await abandonedCheckoutCollection.findOne({ id: checkoutId });
        // console.log("Checkout object fetched with Id:", checkout.id);

        return checkout;
    }
    catch (err) {        
        console.log(err);
    }
}

module.exports.deleteCheckoutObject = async function (checkoutId, shop) {
    try {
        shop = shop.split('.')[0];
        const db = dbClient.db(`shopify-${shop}`);
        const abandonedCheckoutCollection = db.collection('abandoned-checkouts');

        const deleteResponse = await abandonedCheckoutCollection.deleteOne({ id: checkoutId });
        
        console.log("Checkout object with ID: ", checkoutId," has been deleted from DB");

        return deleteResponse;
    }
    catch (err) {
        console.log(err);
    }
}