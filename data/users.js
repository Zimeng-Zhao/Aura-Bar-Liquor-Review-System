import {users, drinks} from "../config/mongoCollections.js";
import {ObjectId} from "mongodb";
import validation from "../publicMethods.js";
import bcrypt from 'bcrypt';
import {fileURLToPath} from "url";
import {dirname, join} from "path";
import {access, unlink} from "fs/promises";
import fs from 'fs/promises';
import path from 'path';


/**
 * @param {ObjectId} _id - A globally unique identifier to represent the user.
 * @param {string} firstName - First name of the user.
 * @param {string} lastName - Last name of the user.
 * @param {string} email - Email of the user.
 * @param {string} phoneNumber - phoneNumber of the user.
 * @param {number} password - The password when users log in.
 * @param {Array(ObjectId)} reviewIds - A unique identifier that guarantees the uniqueness of each review.
 * @param {String} profilePictureLocation - The location of the profile picture.
 * @param {List{timestamp, drinkId}} drinkReserved - A collection of drink IDs that the user had already reserved.
 * @param {String} role - A Stringvariable reflects whether the user is an admin or user.
 */

export const createUser = async (
    firstName,
    lastName,
    email,
    phoneNumber,
    password,
    profilePictureLocation,
    role
) => {
    firstName = validation.validateName(firstName, "firstName");
    // console.log(firstName);
    lastName = validation.validateName(lastName, "lastName");
    email = validation.validateEmail(email, "email");
    phoneNumber = validation.validatePhoneNumber(phoneNumber);
    password = validation.validatePassword(password, "password");

    role = validation.validateRole(role);

    const userCollection = await users();
    const ifExist = await userCollection.findOne({email: email});
    if (ifExist) {
        throw `Error: ${email} is already registered, Please Login`;
    }
    if(typeof profilePictureLocation === 'string'){
        profilePictureLocation = await validation.validateIfFileExist(profilePictureLocation);
    }
    else{
        profilePictureLocation = await copyPictureAndReturnPath(profilePictureLocation);
    }
    const user = {
        firstName: firstName,
        lastName: lastName,
        email: email,
        phoneNumber: phoneNumber,
        password: await bcrypt.hash(password, 15),
        reviewIds: [],
        profilePictureLocation: profilePictureLocation,
        drinkReserved: [],
        role: role
    }

    const insertUser = await userCollection.insertOne(user);
    if (!insertUser.acknowledged || !insertUser.insertedId) {
        throw `Error: couldn't register the account: ${email}`;
    }
    return {insertedUser: true};
}

export const loginUser = async (email, password) => {
    email = validation.validateEmail(email);
    password = validation.validatePassword(password);

    const userCollection = await users();
    const user = await userCollection.findOne({
        email: email
    });
    if (!user) {
        throw "Error: Either the email address or password is invalid";
    }
    const checkPassword = await bcrypt.compare(
        password,
        user.password
    );
    if (!checkPassword) {
        throw "Error: Either the email address or password is invalid"
    } else {
        return {
            userId: user._id.toString(),
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            phoneNumber: user.phoneNumber,
            reviewIds: user.reviewIds,
            profilePictureLocation: user.profilePictureLocation,
            drinkReserved: user.drinkReserved,
            role: user.role
        };
    }
};

export const updateUser = async (
    firstName,
    lastName,
    email,
    phoneNumber,
    password,
    reviewIds,
    profilePictureLocation,
    drinkReserved,
    role
) => {
    firstName = validation.validateName(firstName, "firstName");
    lastName = validation.validateName(lastName, "lastName");
    email = validation.validateEmail(email, "email");
    phoneNumber = validation.validatePhoneNumber(phoneNumber);
    password = validation.validatePassword(password, "password");
    reviewIds = validation.validateArrayOfIds(reviewIds);
    drinkReserved = validation.validateArrayOfIds(drinkReserved);
    role = validation.validateRole(role);

    const userCollection = await users();
    const user = await userCollection.findOne({ email: email });

    if (!user) {
        throw `Error: User with email ${email} not found`;
    }
    const oldProfilePictureLocation = user.profilePictureLocation;
    profilePictureLocation = await validation.validateIfFileExist(profilePictureLocation);
    const updatedUser = {
        firstName: firstName,
        lastName: lastName,
        email: email,
        phoneNumber: phoneNumber,
        password: await bcrypt.hash(password, 15),
        reviewIds: reviewIds,
        profilePictureLocation: profilePictureLocation,
        drinkReserved: drinkReserved,
        role: role,
    };

    const updateUser = await userCollection.updateOne(
        { _id: user._id },
        { $set: updatedUser }
    );
    if (updateUser.modifiedCount === 0) {
        throw `Error: Failed to update user with email ${email}`;
    }
    try {
        if (oldProfilePictureLocation!=='') {
            const currentFilePath = fileURLToPath(import.meta.url);
            const currentDirPath = dirname(currentFilePath);
            const absolutePath = join(currentDirPath.replace('data', 'public'), oldProfilePictureLocation);
            await access(absolutePath);
            await unlink(absolutePath);
        }
    } catch (error) {
        throw `Error: Failed to delete old drink picture at ${oldProfilePictureLocation}`;
    }
    return { updatedUser: true };
}

export const getAllReviewsByUserId = async (
    userId
) => {
    userId = validation.validateId(userId,"userId");

    const userCollection = await users();
    const user = await
        userCollection
        .find({ _id: new ObjectId(userId) });

    if (!user) {
        throw `Error: User with ID ${userId} not found, Cannot get his/her reviews`;
    }
    return user.reviewIds||[];
}

export const getAllDrinkReservedByUserId = async (
    userId
)=> {
    userId = validation.validateId(userId,"userId");
    const userCollection = await users();
    const user = await userCollection.findOne({ _id: new ObjectId(userId) });

    if (!user) {
        throw `Error: User with ID ${userId} not found`;
    }
    let drinkReserved = user.drinkReserved;

    drinkReserved.sort((a, b) => {
        let m = new Date(a.timestamp);
        let n = new Date(b.timestamp);
        if (m.getTime() < n.getTime()) {
            return -1;
        } else {
            return 1;}
    });
    return user.drinkReserved || [];
}


export const getUserInfoByUserId = async (
    userId
)=> {
    userId = validation.validateId(userId,"userId");
    const userCollection = await users();
    const user = await userCollection.findOne({ _id: new ObjectId(userId) });

    if (!user) {
        throw `Error: User with ID ${userId} not found`;
    }
    return {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        reviewIds: user.reviewIds,
        profilePictureLocation: user.profilePictureLocation,
        drinkReserved: user.drinkReserved,
        role: user.role
    };
}

export const getUserInfoByEmail = async (
    email
)=> {
    email = validation.validateEmail(email);
    const userCollection = await users();
    const user = await userCollection.findOne({ email: email });

    if (!user) {
        throw `Error: User with email ${email} not found`;
    }
    return {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        reviewIds: user.reviewIds,
        profilePictureLocation: user.profilePictureLocation,
        drinkReserved: user.drinkReserved,
        role: user.role
    };
}

export const getUserIdByEmail = async (
    email
)=> {
    email = validation.validateEmail(email);
    const userCollection = await users();
    const user = await userCollection.findOne({ email: email });

    if (!user) {
        throw `Error: User with email ${email} not found`;
    }
    return {
        id: user._id.toString()
    };
}

export const getUserPasswordById = async (
    userId
)=> {
    userId = validation.validateId(userId, "userId");
    const userCollection = await users();
    const user = await userCollection.findOne({ _id: new ObjectId(userId) });

    if (!user) {
        throw `Error: User with _id ${userId} not found`;
    }
    return {
        password: user.password
    };
}

export const deleteOneReviewFromUser = async (
    reviewId, userId
)=> {
    reviewId = validation.validateId(reviewId, "reviewId");
    const userCollection = await users();
    const user = await userCollection.findOne({ _id: new ObjectId(userId)});
    if (!user) {
        throw `Error: User with email ${userId} not found`;
    }
    let reviewList = user.reviewIds;
    for (let i = 0; i < reviewList.length; i++) {
        const element = reviewList[i];
        if (element === reviewId) {
            reviewList.splice(i, 1);
        }
    }
    const updateReviewIds = await userCollection.updateOne(
        { _id: new ObjectId(userId) },
        { $set: { reviewIds: reviewList } }
    );
    if (updateReviewIds.modifiedCount === 0) {
        throw `Error: Could not delete reviewId${reviewId} from user!`;
    }
    return true;
}

export const reserveDrink = async (
    userId, drinkId
)=>{
    userId = validation.validateId(userId, "userId");
    drinkId = validation.validateId(drinkId, "drinkId");

    const userCollection = await users();
    const user = await userCollection.findOne({ _id: new ObjectId(userId) });
    if (!user) {
        throw `Error: User with ID ${userId} not found`;
    }

    const drinkCollection = await drinks();
    const drink = await drinkCollection.findOne({ _id: new ObjectId(drinkId) });

    if (!drink) {
        throw `Error: drink with ID ${drinkId} not found`;
    }

    if (!drink.available) {
        throw `Error: drink with ID ${drinkId} not available, cannot reverse`;
    }

    const timestamp = validation.generateCurrentDate();
    const reservedDrink = { drinkId, timestamp };
    const updatedReservedDrinks = [...user.drinkReserved, reservedDrink];
    const updateResult = await userCollection.updateOne(
        { _id: user._id },
        { $set: { drinkReserved: updatedReservedDrinks } }
    );
    if (updateResult.modifiedCount === 0) {
        throw `Error: Failed to reserve drink for user with ID ${userId}`;
    }

    const newReservedCount = drink.reservedCounts + 1;
    const updatedCounts = await drinkCollection.updateOne(
        { _id: drink._id },
        { $set: { reservedCounts: newReservedCount } }
    );
    if (updatedCounts.modifiedCount === 0) {
        throw `Error: Failed to drink reserved count for user with drink ID ${drink._id}`;
    }


    return {reservedDrink, userId};
}

export const copyPictureAndReturnPath = async (file) => {
    try {
        const data = await fs.readFile(file.path);
        const extName = file.mimetype.split('/')[1];
        const imgName = `${file.filename}.${extName}`;
        const newPath = path.resolve(`./public/pictures/${imgName}`);
        await fs.writeFile(newPath, data);
        await fs.unlink(file.path);
        return newPath;
    } catch (err) {
        throw  `Error: error when processing file: ${err.message}`;
    }
};
export const getAllUsers = async () => {
    const userCollection = await users();
    const user = await userCollection.find({}).toArray();
    return user;
};

export const addReviewIdToAUser = async (
    reviewId, userId
) => {
    const userCollection = await users();
    const user = await userCollection.findOne({_id: new ObjectId(userId)});
    const UpdatedReviewId = [...user.reviewIds, reviewId];
    const updateResult = await userCollection.updateOne(
        { _id: user._id },
        { $set: { reviewIds: UpdatedReviewId } }
    );
    return user;
};