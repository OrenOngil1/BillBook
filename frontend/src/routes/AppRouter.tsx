import { Route, Routes, BrowserRouter } from "react-router";
import GroupsPage from "../features/groups/GroupsPage";
import GroupPage from "../features/groups/GroupPage";

export default function AppRouter() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<GroupsPage />}/>
                <Route path="/groups">
                    <Route path=":id" element={<GroupPage />} />
                </Route>                
            </Routes>
        </BrowserRouter>
    );
}