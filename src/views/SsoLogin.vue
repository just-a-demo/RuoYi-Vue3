<template>
    <div class="sso-login">
        <div class="sso-box">
            <div v-if="loading" class="sso-status">
                <div class="spinner"></div>
                <p>正在登录，请稍候...</p>
            </div>
            <div v-else-if="error" class="sso-status error">
                <p>❌ {{ errorMsg }}</p>
                <el-button type="primary" @click="goLogin">返回登录页</el-button>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import useUserStore from '@/store/modules/user'
import { setToken } from '@/utils/auth'
import { ssoLogin } from '@/api/login'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const loading = ref(true)
const error = ref(false)
const errorMsg = ref('')

onMounted(() => {
    doSsoLogin()
})

async function doSsoLogin() {
    // 从 URL 参数获取 SSO 凭据
    const username = route.query.username
    const ticket = route.query.ticket

    if (!username && !ticket) {
        showError('缺少 SSO 登录凭据')
        return
    }

    try {
        // 调后端换取 JWT
        const res = await ssoLogin({ username, ticket })
        // 存 token（若依标准方式）
        setToken(res.token)
        userStore.token = res.token
        // 拉取用户信息 + 权限
        await userStore.getInfo()
        // 跳首页或指定页
        const redirect = route.query.redirect || '/index'
        router.replace({ path: redirect })
    } catch (e) {
        showError(e?.msg || 'SSO 登录失败，请重试')
    }
}

function showError(msg) {
    loading.value = false
    error.value = true
    errorMsg.value = msg
}

function goLogin() {
    router.replace('/login')
}
</script>

<style scoped>
.sso-login {
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #2d3a4b;
}

.sso-box {
    text-align: center;
    color: #fff;
}

.sso-status p {
    margin-top: 16px;
    font-size: 16px;
}

.spinner {
    width: 40px;
    height: 40px;
    margin: 0 auto;
    border: 4px solid rgba(255, 255, 255, 0.2);
    border-top-color: #409eff;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
}

@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}

.error p {
    color: #f56c6c;
}
</style>