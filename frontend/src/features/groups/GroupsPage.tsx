import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { groupsApi } from "../../api/endpoints";
import { isActiveUser } from "../../types";
import BalanceEntries from "../../components/BalanceEntries";

export default function GroupsPage() {
    const { isPending, error, data } = useQuery({
        queryKey: ["groups"],
        queryFn: () => groupsApi.getAll()
    });

    if (isPending) {
        return <div>Loading...</div>;
    }

    if (error) {
        return <div>{error.message}</div>;
    }

    return (
        <>
            <h1>Groups</h1>
            {data.map((groupSummary) => 
            <Link key={groupSummary.group.id} to={`/groups/${groupSummary.group.id}`}>
                <article>
                    <h2>{groupSummary.group.name}</h2>
                    <BalanceEntries records={groupSummary.balances.filter(isActiveUser)} limit={3} />
                </article>
            </Link>)}
        </>
    )
}