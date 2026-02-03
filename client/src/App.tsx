import { Router, Route } from 'wouter'
import { DashboardLayout } from './components/layout/DashboardLayout'
import { DashboardPage } from './pages/dashboard'
import { ChatPage } from './pages/chat'

function App() {
  return (
    <Router>
      <Route path="/chat" component={ChatPage} />
      <Route path="/dashboard">
        <DashboardLayout>
          <Route path="/" component={DashboardPage} />
          <Route path="/analytics" component={() => <div>数据分析页面</div>} />
          <Route path="/conversations" component={() => <div>对话管理页面</div>} />
          <Route path="/knowledge" component={() => <div>知识库页面</div>} />
          <Route path="/content" component={() => <div>内容生成页面</div>} />
          <Route path="/customers" component={() => <div>客户管理页面</div>} />
          <Route path="/xiaohongshu" component={() => <div>小红书运营页面</div>} />
          <Route path="/triggers" component={() => <div>自动化触发页面</div>} />
          <Route path="/config" component={() => <div>系统配置页面</div>} />
        </DashboardLayout>
      </Route>
      <Route path="/" component={() => <div>首页</div>} />
    </Router>
  )
}

export default App
