import createError from "http-errors";
import { prisma } from "../db.js";

export async function assertGroupMembers(groupId: number, senderId: number, ...userIds: number[]) {
    const members = await prisma.user.findMany({
        select: { id: true },
        where: {
            id: { in: [...userIds, senderId] },
            groups: { some: { id: groupId } }
        } 
    });

    const memberIds = new Set(members.map((member) => member.id));

    if (!memberIds.has(senderId)) {
        throw createError(404, "Group not found");
    }
    if(userIds.some((id) => !memberIds.has(id))) {
        throw createError(422, `You must choose a user from this group`);
    }
}