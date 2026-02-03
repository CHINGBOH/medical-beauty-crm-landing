import { Router, Route } from "wouter";
import DashboardLayout from "./components/DashboardLayout";
import Admin from "./pages/Admin";
import Analytics from "./pages/Analytics";
import Chat from "./pages/Chat";
import DashboardAI from "./pages/DashboardAI";
import DashboardAnalytics from "./pages/DashboardAnalytics";
import DashboardConfig from "./pages/DashboardConfig";
import DashboardContent from "./pages/DashboardContent";
import DashboardConversations from "./pages/DashboardConversations";
import DashboardCustomers from "./pages/DashboardCustomers";
import DashboardKnowledge from "./pages/DashboardKnowledge";
import DashboardQueue from "./pages/DashboardQueue";
import DashboardRag from "./pages/DashboardRag";
import DashboardTriggers from "./pages/DashboardTriggers";
import DashboardWework from "./pages/DashboardWework";
import DashboardXiaohongshu from "./pages/DashboardXiaohongshu";
import Home from "./pages/Home";

function App() {
  return (
    <Router>
      <Route path="/chat" component={Chat} />
      <Route path="/dashboard">
        <DashboardLayout>
          <Route path="/" component={Analytics} />
          <Route path="/admin" component={Admin} />
          <Route path="/ai" component={DashboardAI} />
          <Route path="/analytics" component={DashboardAnalytics} />
          <Route path="/conversations" component={DashboardConversations} />
          <Route path="/knowledge" component={DashboardKnowledge} />
          <Route path="/rag" component={DashboardRag} />
          <Route path="/content" component={DashboardContent} />
          <Route path="/customers" component={DashboardCustomers} />
          <Route path="/xiaohongshu" component={DashboardXiaohongshu} />
          <Route path="/triggers" component={DashboardTriggers} />
          <Route path="/queue" component={DashboardQueue} />
          <Route path="/wework" component={DashboardWework} />
          <Route path="/config" component={DashboardConfig} />
        </DashboardLayout>
      </Route>
      <Route path="/" component={Home} />
    </Router>
  );
}

export default App;
