import {getFirestore} from "firebase-admin/firestore";
import {User} from "../types";

export const findUsers = async (query: string): Promise<User[]> => {
  const db = getFirestore();
  const usersRef = db.collection("users");
  const users: User[] = [];

  const snapshot = await usersRef
    .where("displayName", ">=", query)
    .where("displayName", "<=", query + "\uf8ff")
    .limit(10)
    .get();

  snapshot.forEach((doc) => {
    users.push(doc.data() as User);
  });

  return users;
};
