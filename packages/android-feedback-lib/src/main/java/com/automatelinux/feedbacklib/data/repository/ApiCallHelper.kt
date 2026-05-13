package com.automatelinux.feedbacklib.data.repository

import kotlinx.coroutines.delay
import retrofit2.Response
import java.net.SocketException
import java.net.ConnectException
import javax.net.ssl.SSLException

@PublishedApi
internal fun isTransientNetworkError(e: Exception): Boolean =
    e is SocketException || e is ConnectException ||
    (e is SSLException && e.message?.contains("connection abort", ignoreCase = true) == true)

suspend inline fun <T> apiCall(crossinline block: suspend () -> Response<T>): Result<T> {
    var lastException: Exception? = null
    repeat(2) { attempt ->
        try {
            val response = block()
            if (response.isSuccessful) {
                val body = response.body()
                return if (body != null) {
                    Result.success(body)
                } else {
                    Result.failure(Exception("Empty response body"))
                }
            } else {
                val errorBody = response.errorBody()?.string()
                val message = if (!errorBody.isNullOrBlank()) {
                    try {
                        val gson = com.google.gson.Gson()
                        val errorMap = gson.fromJson(errorBody, Map::class.java)
                        errorMap["error"]?.toString() ?: errorBody
                    } catch (_: Exception) {
                        errorBody
                    }
                } else {
                    "HTTP ${response.code()}: ${response.message()}"
                }
                return Result.failure(Exception(message))
            }
        } catch (e: Exception) {
            if (attempt == 0 && isTransientNetworkError(e)) {
                lastException = e
                delay(500)
            } else {
                return Result.failure(e)
            }
        }
    }
    return Result.failure(lastException!!)
}
