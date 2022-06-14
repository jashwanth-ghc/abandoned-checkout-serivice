const { MongoClient, ServerApiVersion } = require("mongodb");
// const fetch = require("node-fetch");

const DB_URI = process.env.MONGO_URI;
// const dbBaseURL = process.env.MONGO_HTTP_URI;

const databaseClient = new MongoClient(DB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverApi: ServerApiVersion.v1
});

let dbClient;

async function getDbClient() {
    console.log("Function getDbCLient entered");
    if (dbClient) {
        console.log("DB client exists");
        return dbClient;
    }
    try {
        console.log("DB client doesn't exist");
        console.log("MONGO_URI:", process.env.MONGO_URI);
        await databaseClient.connect();
        console.log("Function getDbCLient Step-1");
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

        // let url = dbBaseURL + "/action/findOne";

        // let options = {
        //     method: "POST",
        //     headers: {
        //         'Content-Type': 'application/json',
        //         'Access-Control-Request-Headers': '*',
        //         'api-key': 'AkM3NbguIXWZ0xu6vgrkjCRCZgWcgRMS6R5Bo1n82TNDiIe2BFq4npaKzwaiAzIx',
        //     },
        //     body:JSON.stringify({
        //         "collection": "abandoned-checkouts",
        //         "database": `shopify-${shop}`,
        //         "dataSource": "GHC",
        //         "filter": {
        //             "id": `${checkoutId}`
        //         }
        //     })
        // }

        // console.log("Function Get checkout -before Fetch");

        const db = dbClient.db(`shopify-${shop}`);
        const abandonedCheckoutCollection = db.collection('abandoned-checkouts');

        const checkout = await abandonedCheckoutCollection.findOne({ id: checkoutId });

        // const response = await fetch(url, options);

        // console.log("Function Get checkout - after Fetch");
        // if(!response || !response.ok){
        //     throw new Error("Fetching checkout failed");
        // }
        // const checkout = response.json();
        console.log("Checkout ID received:", checkout.id);

        return checkout;
    }
    catch (err) {
        console.log("Function Get checkout - Catch Block");
        console.log(err);
    }
}

module.exports.deleteCheckoutObject = async function (checkoutId, shop) {
    try {
        // let url = dbBaseURL + "/action/deleteOne";

        // let options = {
        //     method: "POST",
        //     headers: {
        //         'Content-Type': 'application/json',
        //         'Access-Control-Request-Headers': '*',
        //         'api-key': 'AkM3NbguIXWZ0xu6vgrkjCRCZgWcgRMS6R5Bo1n82TNDiIe2BFq4npaKzwaiAzIx',
        //     },
        //     body:JSON.stringify({
        //         "collection": "abandoned-checkouts",
        //         "database": `shopify-${shop}`,
        //         "dataSource": "GHC",
        //         "filter": {
        //             "id": `${checkoutId}`
        //         }
        //     })
        // }

        const db = dbClient.db(`shopify-${shop}`);
        const abandonedCheckoutCollection = db.collection('abandoned-checkouts');

        const deleteResponse = await abandonedCheckoutCollection.deleteOne({ id: checkoutId });

        // const response = await fetch(url, options);
        // if(!response || !response.ok){
        //     throw new Error("Deleting checkout failed");
        // }
        // const deleteResponse = response.json();
        console.log("Deleted Checkout with ID:", checkoutId);

        return deleteResponse;
    }
    catch (err) {
        console.log(err);
    }
}