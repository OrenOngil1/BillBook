import { useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { groupsApi } from "../../api/endpoints";
import { DEV_USER_ID } from "../../api/client";
import { DELETED_USER, isActiveUser } from "../../types";
import BalanceEntries from "../../components/BalanceEntries";
import CreateSettlement from "../settlements/CreateSettelment";
import CreateExpense from "../expenses/CreateExpense";

type GroupFullDetailsProps = Readonly<{
    id: number
}>;

export default function GroupPage() {
    const { id } = useParams();
    
    if (!id || !Number.isSafeInteger(Number(id))) {
        return <h1>Group Not Found</h1>;
    }

    return <GroupFullDetalis id={Number(id)} />;
}

function GroupFullDetalis({ id }: GroupFullDetailsProps) {
    const { isPending, error, data } = useQuery({
        queryKey: ["group", id],
        queryFn: () => groupsApi.getById(id)
    });

    if(isPending) {
        return <h1>Loading...</h1>;
    }

    if (error) {
        return <div>{error.message}</div>;
    }

    const { group: groupDetails, balances } = data;
    const { members: membersWithDeletedUsers, expenses, settlements, ...group} = groupDetails;
    const members = membersWithDeletedUsers.filter(isActiveUser);

    const usernameById = new Map(members.map(({ id, username }) => [id, username]));
    const nameOf = (userId: number) => usernameById.get(userId) ?? DELETED_USER;

    const otherMembers = members.filter(({ id }) => id !== Number(DEV_USER_ID));

    const activities = [
        ...expenses.map(({ id, createdAt, payerId, amountCents, currency, description }) => ({
            key: `expense-${id}`,
            createdAt,
            text: `${nameOf(payerId)} paid ${(amountCents / 100).toFixed(2)} ${currency} for ${description}`,
        })),
        ...settlements.map(({ id, createdAt, userFromId, userToId, amountCents, currency }) => ({
            key: `settlement-${id}`,
            createdAt,
            text: `${nameOf(userFromId)} has settled with ${nameOf(userToId)} for ${(amountCents / 100).toFixed(2)} ${currency}`,
        })),
    ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    const balancesByMember = balances
        .filter(isActiveUser)
        .sort((a, b) => a.username.localeCompare(b.username) || a.userId - b.userId);

    return (
        <>
            <h1>{group.name}</h1>
            <BalanceEntries records={balancesByMember} />
            {balancesByMember.length > 0 &&
                <details open={false}>
                    <summary>Settle</summary>
                    <CreateSettlement groupId={id} members={otherMembers} />
                </details>}
            <details open={false}>
                <summary>Add expense</summary>
                <CreateExpense groupId={id} members={otherMembers} />
            </details>
            <div>
                <ul aria-label="Activity">
                    {activities.map(({ key, text }) => <li key={key}>{text}</li>)}
                </ul>
            </div>
        </>
        
    );
}